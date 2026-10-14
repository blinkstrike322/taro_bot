"""Prepared studio prose through the real session API; never a model answer."""

import asyncio


class Fixtures:
    def __init__(self):
        self.failure_next = False
        self.delay_next = 0

    async def checkpoint(self):
        delay = self.delay_next
        failed = self.failure_next
        self.delay_next = 0
        self.failure_next = False
        await asyncio.sleep(delay or 0.35)
        if failed:
            raise RuntimeError("Проверочный сбой студии. Карты сохранены.")

    async def reading(self, question=None, cards=None, positions=None, character_id="shadow_walker", **kw):
        await self.checkpoint()
        voice = {
            "shadow_walker": "Можно немного замедлиться и услышать собственное чувство.",
            "ruin_keeper": "Начнём с того, что уже известно и на что можно опереться.",
            "spark_of_chaos": "Оставим место неожиданному: привычный путь — лишь один из возможных.",
        }[character_id]
        entries = []
        for i, c in enumerate(cards or []):
            meaning = c.get("reversed" if c.get("is_reversed") else "upright", "")
            entries.append(
                {
                    "позиция": positions[i] if positions and i < len(positions) else "Фокус дня",
                    "карта": c["name"],
                    "реверс": c.get("is_reversed", False),
                    "трактовка": f"{voice}\n\n{c['name']} приносит в эту позицию темы: {meaning}. Вспомни один недавний момент, в котором этот образ был тебе близок. Что ты тогда чувствовала, что знала точно, а что только предполагала?\n\nНе обязательно решать всё сразу. Отдели своё желание от чужих ожиданий и назови тот небольшой шаг, который можешь сделать в своём темпе. Образ карты помогает посмотреть на ситуацию с другого угла; выбор остаётся у тебя.",
                }
            )
        return {
            "intro": voice,
            "short_answer": "Выбери один вопрос, который можно прояснить действием, а не новым предположением.",
            "позиции": entries,
            "связь_карт": "Эти позиции складываются в движение от наблюдения к собственному решению. Сравни, где карты поддерживают друг друга, а где показывают противоречие. Именно ему можно уделить чуть больше внимания.",
            "advice": "Запиши то, что откликнулось. Вернись к этому через день и посмотри, что изменилось.",
        }

    async def ask(self, messages, **kw):
        await self.checkpoint()
        return "Начни с одного небольшого действия, после которого появится новая информация. Это может быть спокойный разговор или время на собственные записи. Заметь, что изменилось в твоём ощущении ситуации, и только затем решай, нужен ли следующий шаг."
