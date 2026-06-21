from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class User(BaseModel):
    id: int
    tg_id: int
    character_id: str = "shadow_walker"
    created_at: str
    last_active_at: str
    last_reminder_sent_at: Optional[str] = None
    subscription_end: Optional[str] = None
    first_month_done: int = 0


class Reading(BaseModel):
    id: int
    user_id: int
    type: str
    question: Optional[str] = None
    cards_data: dict
    interpretation: dict
    character_id: str = "shadow_walker"
    created_at: str
