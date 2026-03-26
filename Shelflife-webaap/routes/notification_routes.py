from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from database import db
from models import Notification
from services import cleanup_notifications_for_user, refresh_notifications_for_user, send_expiry_emails_for_user


notification_bp = Blueprint('notification', __name__)


def serialize_notification(notification):
    return {
        'id': notification.id,
        'message': notification.message,
        'status': notification.status,
        'is_read': notification.is_read,
        'item_id': notification.item_id,
        'created_at': notification.created_at.isoformat() if notification.created_at else None
    }


@notification_bp.route('/notifications', methods=['GET'])
@jwt_required()
def get_notifications():
    user_id = int(get_jwt_identity())
    refresh_notifications_for_user(user_id)
    cleanup_notifications_for_user(user_id)
    notifications = (
        Notification.query
        .filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    return jsonify([serialize_notification(notification) for notification in notifications]), 200


@notification_bp.route('/notifications/<int:notification_id>/read', methods=['PATCH'])
@jwt_required()
def mark_notification_read(notification_id):
    user_id = int(get_jwt_identity())
    notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not notification:
        return jsonify({'message': 'Notification not found'}), 404

    notification.is_read = True
    db.session.commit()
    cleanup_notifications_for_user(user_id)
    return jsonify({'message': 'Notification marked as read'}), 200


@notification_bp.route('/notifications/mark-all-read', methods=['PATCH'])
@jwt_required()
def mark_all_notifications_read():
    user_id = int(get_jwt_identity())
    notifications = Notification.query.filter_by(user_id=user_id, is_read=False).all()

    for notification in notifications:
        notification.is_read = True

    db.session.commit()
    cleanup_notifications_for_user(user_id)

    return jsonify({'message': 'All notifications marked as read'}), 200


@notification_bp.route('/notifications/send-email', methods=['POST'])
@jwt_required()
def send_notification_email():
    user_id = int(get_jwt_identity())
    result = send_expiry_emails_for_user(user_id, include_meta=True)
    sent_messages = result.get('sent_messages', [])
    attempted = result.get('attempted', 0)
    reason = result.get('reason')

    if sent_messages:
        return jsonify({
            'message': f'Email sent successfully ({len(sent_messages)}/{attempted})',
            'sent': sent_messages,
            'attempted': attempted,
            'reason': reason
        }), 200

    reason_messages = {
        'no_notifications': 'No expiring items found, so no email was sent.',
        'mail_test_mode': 'Email is disabled: set MAIL_TEST_MODE=False in .env to send real emails.',
        'sendgrid_credentials_missing': 'SendGrid not configured: set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in .env.',
        'mail_credentials_missing': 'Email credentials missing: set MAIL_USERNAME and MAIL_PASSWORD in .env.',
        'send_failed': 'Email send failed. Please verify SMTP credentials and app password.',
        'user_not_found': 'User not found.',
        'internal_error': 'Email service error. Check server logs for details.'
    }
    status_code = 400 if reason in {'mail_test_mode', 'mail_credentials_missing', 'send_failed', 'user_not_found'} else 200
    return jsonify({
        'message': reason_messages.get(reason, 'Email was not sent.'),
        'sent': [],
        'attempted': attempted,
        'reason': reason
    }), status_code
