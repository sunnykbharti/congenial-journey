#!/bin/bash
set -e

echo "=========================================="
echo " Running PosePlay Backend Test Suite"
echo "=========================================="
cd ../backend
./env/bin/python test_game.py

echo ""
echo "=========================================="
echo " Running PosePlay Frontend Test Suite"
echo "=========================================="
cd ../frontend
npm test

echo ""
echo "=========================================="
echo " Verifying Frontend Linter & Build"
echo "=========================================="
npm run lint
npm run build

echo ""
echo "=========================================="
echo " All PosePlay Tests & Builds Passed!"
echo "=========================================="
