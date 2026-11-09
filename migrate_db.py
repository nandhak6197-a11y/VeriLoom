import sqlite3

con = sqlite3.connect("backend/veriloom.db")
cur = con.cursor()

# Facts table
cols_f = [r[1] for r in cur.execute("PRAGMA table_info(facts)").fetchall()]
if "provenance_hash" not in cols_f:
    cur.execute("ALTER TABLE facts ADD COLUMN provenance_hash VARCHAR(64) DEFAULT ''")
    print("Added provenance_hash to facts table")

# Assets table
cols_a = [r[1] for r in cur.execute("PRAGMA table_info(assets)").fetchall()]
if "jurisdiction" not in cols_a:
    cur.execute("ALTER TABLE assets ADD COLUMN jurisdiction VARCHAR(32) DEFAULT 'US'")
    print("Added jurisdiction to assets table")

con.commit()
con.close()
print("Migration completed successfully!")
