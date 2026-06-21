import logging

from aiogram.types import LabeledPrice

logger = logging.getLogger(__name__)

FIRST_MONTH_PRICE = 100   # Stars
REGULAR_PRICE = 600       # Stars

SUBSCRIPTION_TITLE = "Подписка на месяц"
SUBSCRIPTION_DESCRIPTION_FIRST = "100 раскладов в месяц. Первый месяц — скидка!"
SUBSCRIPTION_DESCRIPTION_REGULAR = "100 раскладов в месяц."


def get_subscription_price(first_month: bool = False) -> list[LabeledPrice]:
    """Return LabeledPrice for Telegram invoice."""
    amount = FIRST_MONTH_PRICE if first_month else REGULAR_PRICE
    return [LabeledPrice(label="Подписка", amount=amount)]
