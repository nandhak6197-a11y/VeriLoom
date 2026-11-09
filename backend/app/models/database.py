# -*- coding: utf-8 -*-
"""SQLAlchemy Database Engine & Session Configuration."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.app.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        try:
            cols_f = [r[1] for r in cursor.execute("PRAGMA table_info(facts)").fetchall()]
            if cols_f and "provenance_hash" not in cols_f:
                cursor.execute("ALTER TABLE facts ADD COLUMN provenance_hash VARCHAR(64) DEFAULT ''")
            cols_a = [r[1] for r in cursor.execute("PRAGMA table_info(assets)").fetchall()]
            if cols_a and "jurisdiction" not in cols_a:
                cursor.execute("ALTER TABLE assets ADD COLUMN jurisdiction VARCHAR(32) DEFAULT 'US'")
            dbapi_connection.commit()
        except Exception:
            pass
        finally:
            cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency yielding a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
