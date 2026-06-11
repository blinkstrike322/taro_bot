from aiogram import Router

from .handlers import character_router, start_router

router = Router()
router.include_router(start_router)
router.include_router(character_router)


def register_handlers(dp) -> None:
    dp.include_router(router)
