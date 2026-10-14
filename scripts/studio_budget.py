"""Conservative preflight accounting for each local live provider request."""
import sqlite3
from pathlib import Path

class BudgetExceeded(RuntimeError): pass

class Budget:
    def __init__(self,path,max_calls=10,max_usd=.05):
        if not 1<=max_calls<=100 or not 0<max_usd<=4.99: raise ValueError('Studio limits:1–100 calls, USD0–4.99 (prior probes reserved separately).')
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        self.max_calls=max_calls;self.max_usd=max_usd
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE IF NOT EXISTS debits (usd REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    def reserve(self,usd):
        if not 0<usd<5: raise BudgetExceeded('Invalid cost estimate')
        with sqlite3.connect(self.path) as db:
            cursor=db.execute('INSERT INTO debits(usd) SELECT ? WHERE (SELECT COUNT(*) FROM debits) < ? AND (SELECT COALESCE(SUM(usd),0) FROM debits) + ? <= ?',(usd,self.max_calls,usd,self.max_usd))
            if cursor.rowcount!=1: raise BudgetExceeded('Локальный лимит модели достигнут. Нового запроса не было.')
    def totals(self):
        with sqlite3.connect(self.path) as db:
            calls,usd=db.execute('SELECT COUNT(*),COALESCE(SUM(usd),0) FROM debits').fetchone()
            return {'calls':calls,'reserved_usd':usd,'max_calls':self.max_calls,'max_usd':self.max_usd}
