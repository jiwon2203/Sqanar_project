# routes/scan.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from Server.models.scan_dao import ScanDAO

scan_bp = Blueprint("scan", __name__)

@scan_bp.route("/log", methods=["POST"])
@jwt_required()  # JWT 토큰 필요
def log_scan():
    """
    QR 코드 스캔 로그 저장
    헤더 Authorization: Bearer <token> 필요
    """
    user_id = get_jwt_identity()  # 토큰에서 사용자 ID 추출
    data = request.get_json(silent=True) or {}
    qr_code = data.get("qr_code")
    url = data.get("url")
    
    if not qr_code or not url:
        return jsonify({"error": "qr_code와 url이 필요합니다."}), 400
    
    scan_id = ScanDAO.save_scan(user_id, qr_code, url)  # user_id 포함 저장
    return jsonify({"message": "logged", "scan_id": scan_id}), 201

@scan_bp.route("/all", methods=["GET"])
@jwt_required()  # JWT 토큰 필요
def list_scans():
    """
    로그인 사용자 기준 모든 스캔 로그 조회
    헤더 Authorization: Bearer <token> 필요
    """
    user_id = get_jwt_identity()
    scans = ScanDAO.get_all_scans(user_id)  # user_id 기준 조회
    return jsonify(scans), 200
