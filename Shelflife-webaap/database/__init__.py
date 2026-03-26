from flask import current_app
from sqlalchemy import text

from .db import db


def ensure_quantity_column(app=None):
    application = app or current_app
    with application.app_context():
        engine = db.engine
        try:
            with engine.connect() as conn:
                if engine.dialect.name == "sqlite":
                    existing = [row[1] for row in conn.execute(text("PRAGMA table_info(shelflife_items)")).fetchall()]
                    if "quantity" not in existing:
                        conn.execute(text("ALTER TABLE shelflife_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1"))
                else:
                    conn.execute(text("ALTER TABLE shelflife_items ADD COLUMN quantity INT NOT NULL DEFAULT 1"))
        except Exception as error:
            application.logger.info("ensure_quantity_column: %s", error)
