from datetime import date

from database import db


class Item(db.Model):
    __tablename__ = "shelflife_items"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(100), nullable=False)
    expiry_date = db.Column(db.Date, nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    user_id = db.Column(db.Integer, db.ForeignKey('shelflife_users.id'), nullable=False)

    notifications = db.relationship('Notification', backref='item', lazy=True, cascade='all, delete-orphan')

    @property
    def days_until_expiry(self):
        return (self.expiry_date - date.today()).days
