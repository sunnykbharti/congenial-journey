import secrets
import os
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, User

auth_bp = Blueprint('auth', __name__)

# In-memory OTP store.
# Key: mobile string
# Value: {"otp": str, "expires_at": datetime, "attempts": int}
# NOTE: For multi-worker / production deployments replace with Redis or a DB table.
OTP_STORE = {}

# fix #4: brute-force limits
OTP_MAX_ATTEMPTS = 5          # wrong guesses before lockout
OTP_LOCKOUT_MINUTES = 15      # how long the lockout lasts

# Dev mode: print OTP to console instead of sending SMS
_IS_DEV = os.getenv('FLASK_ENV', 'development') == 'development'


@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    mobile = data.get('mobile')
    otp = data.get('otp')

    if not mobile or len(mobile) != 10:
        return jsonify({"message": "Valid 10-digit mobile number is required"}), 400

    # ---------------------------------------------------------
    # STEP 1: Send OTP Request (when 'otp' is not provided)
    # ---------------------------------------------------------
    if not otp:
        # Check if user exists with this phone number
        user = User.query.filter_by(phone=mobile).first()

        if not user:
            return jsonify({"message": "Mobile number not registered in the system"}), 404

        # fix #1: generate a cryptographically random 6-digit OTP
        generated_otp = str(secrets.randbelow(900000) + 100000)
        expires_at = datetime.utcnow() + timedelta(minutes=5)

        OTP_STORE[mobile] = {
            "otp": generated_otp,
            "expires_at": expires_at,
            "attempts": 0,          # fix #4: track wrong guesses
            "locked_until": None,   # fix #4: lockout timestamp
        }

        # TODO: Integrate SMS gateway here (e.g., Fast2SMS, Twilio)
        # In dev mode log the OTP so the app is still usable without SMS
        if _IS_DEV:
            print(f"[auth] DEV OTP for {mobile}: {generated_otp}")

        return jsonify({
            "message": "OTP sent successfully",
            "mobile": mobile
        }), 200

    # ---------------------------------------------------------
    # STEP 2: Verify OTP Request (when 'otp' is provided)
    # ---------------------------------------------------------
    if len(otp) != 6:
        return jsonify({"message": "Valid 6-digit OTP is required"}), 400

    record = OTP_STORE.get(mobile)

    # Check if OTP exists and hasn't expired
    if not record:
        return jsonify({"message": "No OTP requested for this number. Please try again."}), 400

    # fix #4: check lockout before anything else
    if record.get("locked_until") and datetime.utcnow() < record["locked_until"]:
        remaining = int((record["locked_until"] - datetime.utcnow()).total_seconds() / 60) + 1
        return jsonify({"message": f"Too many incorrect attempts. Try again in {remaining} minute(s)."}), 429

    if datetime.utcnow() > record["expires_at"]:
        OTP_STORE.pop(mobile, None)
        return jsonify({"message": "OTP has expired. Please request a new one."}), 400

    if record["otp"] != otp:
        # fix #4: increment attempt counter and lock if threshold hit
        record["attempts"] = record.get("attempts", 0) + 1
        if record["attempts"] >= OTP_MAX_ATTEMPTS:
            record["locked_until"] = datetime.utcnow() + timedelta(minutes=OTP_LOCKOUT_MINUTES)
            return jsonify({"message": f"Too many incorrect attempts. Account locked for {OTP_LOCKOUT_MINUTES} minutes."}), 429
        return jsonify({"message": "Invalid OTP. Please check and try again."}), 401

    # Clear used OTP
    OTP_STORE.pop(mobile, None)

    # Fetch user details
    user = User.query.filter_by(phone=mobile).first()
    if not user:
        return jsonify({"message": "User account not found"}), 404

    # Issue JWT token containing identity and role claims
    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={
            "role": user.role,
            "name": user.name,
            "phone": user.phone
        },
        expires_delta=timedelta(days=1)
    )

    return jsonify({
        "message": "Login successful",
        "access_token": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "phone": user.phone,
            "role": user.role,
            "preferred_language": user.preferred_language
        }
    }), 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    current_user_id = get_jwt_identity()
    user = User.query.get(int(current_user_id))

    if not user:
        return jsonify({"message": "User not found"}), 404

    return jsonify({
        "id": user.id,
        "name": user.name,
        "phone": user.phone,
        "email": user.email,
        "role": user.role,
        "preferred_language": user.preferred_language
    }), 200