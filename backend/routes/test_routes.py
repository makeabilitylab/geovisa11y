from flask import Blueprint, jsonify

test_bp = Blueprint('test', __name__)

@test_bp.route('/test')
def test():
    return jsonify({
        "status": "success",
        "message": "API is working"
    }), 200 