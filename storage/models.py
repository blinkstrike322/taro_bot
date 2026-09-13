
from pydantic import BaseModel


class User(BaseModel):
    id: int
    tg_id: int
    character_id: str = "shadow_walker"
    created_at: str
    last_active_at: str
    last_reminder_sent_at: str | None = None
    subscription_end: str | None = None
    first_month_done: int = 0


class Reading(BaseModel):
    id: int
    user_id: int
    type: str
    question: str | None = None
    cards_data: dict
    interpretation: dict
    character_id: str = "shadow_walker"
    created_at: str
