import os
os.environ.setdefault("BOT_TOKEN", "123456:unit-test")
os.environ.setdefault("OPENROUTER_API_KEY", "test-disabled")
import asyncio
import pytest
from aiohttp.test_utils import TestClient, TestServer
import app as app_module
from tests.test_session_integrity import auth, db, INTERPRETATION
from storage.db import get_user_by_tg_id, update_character, fail_reading

@pytest.mark.asyncio
async def test_fresh_guide_and_begin_replay_keep_snapshot(db, monkeypatch):
    conn, _ = db
    monkeypatch.setattr(app_module, 'interpret_reading', _reading)
    h = {'X-Telegram-Init-Data': auth(801)}
    async with TestClient(TestServer(app_module.create_webapp())) as c:
        r = await c.post('/api/character', headers=h, json={'character_id':'ruin_keeper'})
        assert r.status == 200
        assert (await get_user_by_tg_id(conn,801)).character_id == 'ruin_keeper'
        p={'spread_type':'three','question':'Что мне важно?','idempotency_key':'snapshot-801'}
        first=await (await c.post('/api/spread/begin',headers=h,json=p)).json()
        await update_character(conn,801,'spark_of_chaos')
        r=await c.post('/api/spread/begin',headers=h,json=p)
        assert r.status == 200
        again=await r.json()
        assert again['token']==first['token']
        assert again['character_id']=='ruin_keeper'
        assert again['cards']==first['cards']

async def _reading(**kw): return INTERPRETATION

@pytest.mark.asyncio
async def test_bad_explicit_spread_is_rejected_and_daily_reopens(db, monkeypatch):
    monkeypatch.setattr(app_module,'interpret_reading',_reading)
    h={'X-Telegram-Init-Data':auth(802)}
    async with TestClient(TestServer(app_module.create_webapp())) as c:
        for p in ({'spread_type':'garbage'}, {'spread_type':'single','question':' '}, {'spread_type':[]}):
            r=await c.post('/api/spread/begin',headers=h,json=p)
            assert r.status==400
        one=await (await c.post('/api/spread/begin',headers=h,json={'spread_type':'daily','idempotency_key':'daily-802-one'})).json()
        await asyncio.gather(*list(app_module._whisper_tasks))
        two=await (await c.post('/api/spread/begin',headers=h,json={'spread_type':'daily','idempotency_key':'daily-802-two'})).json()
        assert two['token']==one['token']

@pytest.mark.asyncio
async def test_followup_idempotent_server_context_and_recovery(db, monkeypatch):
    monkeypatch.setattr(app_module,'interpret_reading',_reading)
    captured=[]
    async def ask(messages,**kw):
        captured.append(messages)
        return 'Сохрани спокойный темп и начни с одного небольшого действия.'
    monkeypatch.setattr(app_module,'_ask_llm',ask)
    h={'X-Telegram-Init-Data':auth(803)}
    async with TestClient(TestServer(app_module.create_webapp())) as c:
        b=await (await c.post('/api/spread/begin',headers=h,json={'spread_type':'three','question':'Мой настоящий вопрос','idempotency_key':'reading-803'})).json()
        await asyncio.gather(*list(app_module._whisper_tasks))
        path=f"/api/readings/{b['reading_id']}/followups"
        p={'operation_key':'followup-803','question':'Как сделать первый шаг?','card_index':None,'character_id':'forged','spread_question':'forged'}
        rs=await asyncio.gather(*[c.post(path,headers=h,json=p) for _ in range(4)])
        assert all(r.status in (200,202) for r in rs)
        for _ in range(30):
            rows=(await (await c.get(path,headers=h)).json())['followups']
            if rows and rows[0]['status']!='processing': break
            await asyncio.sleep(.01)
        assert len(rows)==1 and rows[0]['status']=='completed'
        assert len(captured)==1
        assert 'Мой настоящий вопрос' in str(captured) and 'forged' not in str(captured)
        again=await c.post(path,headers=h,json=p)
        assert (await again.json())['answer']==rows[0]['answer']
        assert (await c.post(path,headers=h,json={**p,'question':'Другой вопрос'})).status==409
        assert (await c.get(path,headers={'X-Telegram-Init-Data':auth(804)})).status==403
        restored=await (await c.get(f"/api/spread/session?reading_id={b['reading_id']}",headers=h)).json()
        assert restored['followups']==rows

@pytest.mark.asyncio
async def test_retry_same_cards_once_and_preferences(db, monkeypatch):
    conn,_=db
    async def broken(**kw): raise RuntimeError("interrupted")
    monkeypatch.setattr(app_module,'interpret_reading',broken)
    h={'X-Telegram-Init-Data':auth(805)}
    async with TestClient(TestServer(app_module.create_webapp())) as c:
        b=await (await c.post('/api/spread/begin',headers=h,json={'spread_type':'three','idempotency_key':'reading-805'})).json()
        await asyncio.gather(*list(app_module._whisper_tasks))
        await fail_reading(conn,b['reading_id'],'interrupted')
        calls=[]
        async def retry_reading(**kw): calls.append(kw); return INTERPRETATION
        monkeypatch.setattr(app_module,'interpret_reading',retry_reading)
        p={'token':b['token'],'operation_key':'retry-key-805'}
        rs=await asyncio.gather(*[c.post('/api/spread/retry',headers=h,json=p) for _ in range(3)])
        assert all(r.status==200 for r in rs), [(r.status,await r.text()) for r in rs]
        await asyncio.gather(*list(app_module._whisper_tasks))
        assert len(calls)==1 and calls[0]['cards']==b['cards']
        assert (await c.post('/api/preferences',headers=h,json={'notifications_enabled':False})).status==200
        assert (await (await c.get('/api/preferences',headers=h)).json())['notifications_enabled'] is False
        assert (await c.get('/api/preferences')).status in (401,403)
