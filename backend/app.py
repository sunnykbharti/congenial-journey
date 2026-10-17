"""
app.py – PostureTrek Flask application entry point.

Start-up sequence:
  1. Create Flask app + configure
  2. Initialise extensions (DB, JWT, CORS, Cache)
  3. Create all tables (safe – only creates missing ones)
  4. Auto-seed with demo data if the database is empty
  5. Register blueprints
  6. Serve React SPA from frontend/dist (production)
"""

import os
from flask import Flask, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_caching import Cache
from seed import seed

# ── paths ────────────────────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(__file__)
FRONTEND_DIST = os.path.abspath(os.path.join(BASE_DIR, '../frontend/dist'))
DB_PATH       = os.path.join(BASE_DIR, 'instance', 'postretrek.sqlite')

# ── app ──────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path='')

# ── secret key guard (#2) ─────────────────────────────────────────────────────
_secret_key     = os.getenv('SECRET_KEY')
_jwt_secret_key = os.getenv('JWT_SECRET_KEY')
_is_dev         = os.getenv('FLASK_ENV', 'development') == 'development'

if not _secret_key:
    if _is_dev:
        _secret_key = 'dev-secret-change-me'
        print("[app] WARNING: SECRET_KEY not set — using insecure dev default. Set it in .env for production.")
    else:
        raise ValueError("SECRET_KEY environment variable must be set in production.")

if not _jwt_secret_key:
    if _is_dev:
        _jwt_secret_key = 'dev-jwt-secret-change-me'
        print("[app] WARNING: JWT_SECRET_KEY not set — using insecure dev default. Set it in .env for production.")
    else:
        raise ValueError("JWT_SECRET_KEY environment variable must be set in production.")

app.config.update(
    SQLALCHEMY_DATABASE_URI        = f'sqlite:///{DB_PATH}',
    SQLALCHEMY_TRACK_MODIFICATIONS = False,
    SECRET_KEY                     = _secret_key,
    JWT_SECRET_KEY                 = _jwt_secret_key,
    JWT_TOKEN_LOCATION             = ['headers'],          # fix #8: removed 'query_string' — tokens must never appear in URLs
    CACHE_TYPE                     = 'SimpleCache',
    CACHE_DEFAULT_TIMEOUT          = 300,
    MAX_CONTENT_LENGTH             = 2 * 1024 * 1024,      # fix #12: 2 MB max body — prevents memory-amplification DoS on /analyze_frame
)

# ── extensions ───────────────────────────────────────────────────────────────
from models import db
db.init_app(app)

jwt   = JWTManager(app)
cache = Cache(app)
# fix #7: restrict CORS to known origins — prevents cross-origin request abuse
_allowed_origins = os.getenv(
    'CORS_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5000,http://127.0.0.1:5000'
).split(',')
CORS(app, origins=_allowed_origins)

# ── database init + auto-seed ────────────────────────────────────────────────
with app.app_context():
    # Ensure instance/ directory exists for SQLite file
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    db.create_all()          # Creates tables if they don't exist yet

    # Auto-seed with demo data when the DB is fresh (empty users table)
    try:
        seed()            # seed() is a no-op when data already exists
    except Exception as e:
        print(f"[app] Seed warning: {e}")

# ── blueprints ───────────────────────────────────────────────────────────────
from routes.auth      import auth_bp
from routes.movement  import movement_bp
from routes.dashboard import dashboard_bp
from routes.sessions  import sessions_bp
from routes.emotion   import emotion_bp

app.register_blueprint(auth_bp)
app.register_blueprint(movement_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(emotion_bp)

# ── SPA catch-all (serves React app for all non-API routes) ─────────────────
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_spa(path):
    full = os.path.join(app.static_folder, path)
    if path and os.path.exists(full):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

# ── health check ─────────────────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "app": "PostureTrek API"})

# ── run ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    # fix #6: debug mode controlled by env var, defaults OFF
    _debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(debug=_debug, port=5000)