"""Voice gate: регрессия на провалах слепого теста v1 + догфуд примеров.

Каждый когда-то пропущенный шаблон записан сюда тестом: если модель снова
выдаст «это не прогноз, а диагноз» или «нити» у Искры — упадёт тест, а не юзер.
"""
from __future__ import annotations

import json
from pathlib import Path

from core.voice_gate import (
    SCORE_PASS,
    build_repair_note,
    check_fingerprint,
    check_template,
    find_slop,
    score_example,
    score_interpretation,
)

CHARACTERS = json.loads(
    (Path(__file__).resolve().parent.parent / "data" / "characters.json")
    .read_text(encoding="utf-8")
)
BY_ID = {c["id"]: c for c in CHARACTERS}


def _interp(intro: str, short: str, advice: str) -> dict:
    return {"intro": intro, "short_answer": short, "advice": advice}


# ── Регрессия: обломки v1 (образец D, Искра) ──────────────────────────


def test_v1_contrast_eto_caught():
    assert any(code == "contrast-eto"
               for code, _ in find_slop("это не прогноз вернётся, а диагноз"))


def test_v1_card_talk_caught():
    assert any(code == "card-talk" for code, _ in find_slop(
        "Влюблённые в прямом положении в контексте вашего вопроса"))
    assert any(code == "card-talk" for code, _ in find_slop(
        "карта фиксирует именно её наличие"))


def test_v1_nit_banned_for_spark():
    _score, reasons = score_example(
        "Между вами — нить, но она не вяжет его за спиной", "", "spark_of_chaos")
    assert "lexicon:нит" in reasons, reasons
    # одна нить — штраф, завал — по накоплению с другим шлаком
    full = _interp(
        "Между вами — нить, но она не вяжет его за спиной.",
        "Влюблённые в прямом положении в контексте вашего вопроса — "
        "это не прогноз вернётся, а диагноз.",
        "Карта фиксирует именно её наличие.",
    )
    bad_score, bad_reasons = score_interpretation(full, "spark_of_chaos")
    assert bad_score < SCORE_PASS, (bad_score, bad_reasons)


def test_v1_fundament_banned_for_shadow():
    _score, reasons = score_example(
        "то, что не угасло, станет фундаментом для чего-то нового",
        "", "shadow_walker")
    assert "lexicon:фундамент" in reasons, reasons


def test_v1_keeper_contrast_still_detected():
    # Образец B (Хранитель) был годным, но скелет в нём — шлак и детектится.
    assert any(code == "contrast-vopros" for code, _ in find_slop(
        "Вопрос не в том, придёт ли он — а в том, что ты готова принять"))


def test_v1_rhetorical_opener():
    _score, reasons = score_interpretation(
        _interp("Серьёзно? Ты ещё сомневаешься?", "Текст.", "Делай."),
        "spark_of_chaos")
    assert "rhet-opener" in reasons, reasons


def test_v1_throat_clearing():
    assert find_slop("Дело в том, что карты говорят о переменах")
    assert find_slop("На самом деле всё проще")


# ── Догфуд: все примеры voice_pool сами проходят гейт ────────────────


def test_voice_pool_examples_are_clean():
    failures = []
    for c in CHARACTERS:
        for i, ex in enumerate(c["voice_pool"]):
            score, reasons = score_example(
                ex["intro"], ex["advice"], c["id"])
            if score < 90:
                failures.append((c["id"], i, score, reasons))
    assert not failures, failures


# ── Отпечатки ─────────────────────────────────────────────────────────


def test_keeper_verbose_flagged():
    long = ("Это очень длинное и развёрнутое предложение, которое тянется "
            "и тянется без конца, обрастая придаточными оборотами, уточнениями, "
            "оговорками и пояснениями, которым нет числа. "
            "Второе такое же длинное предложение продолжает мысль ещё дальше, "
            "добавляя новые детали, обстоятельства и характеристики без остановки.")
    codes = [c for c, _p, _r in check_fingerprint(
        _interp("Коротко.", long, "Делай."), "ruin_keeper")]
    assert "keeper-verbose" in codes, codes


def test_spark_needs_staccato_and_fire():
    flat = _interp("Тихое ровное вступление без вопросов",
                   "Ровное повествование средними фразами без восклицаний",
                   "Спокойный совет без огня")
    codes = [c for c, _p, _r in check_fingerprint(flat, "spark_of_chaos")]
    assert "spark-no-staccato" in codes, codes
    assert "spark-no-fire" in codes, codes


def test_shadow_needs_sensory():
    dry = _interp("Сухая констатация факта",
                  "Логичный разбор ситуации по пунктам смысла",
                  "Практический совет без образов")
    codes = [c for c, _p, _r in check_fingerprint(dry, "shadow_walker")]
    assert "shadow-no-sense" in codes, codes


def test_good_keeper_passes():
    interp = _interp(
        "Стена трещит. Трещина уже видна.",
        "Связь есть. Решения нет. Выбор за тобой.",
        "Реши сегодня. Одно дело.",
    )
    score, _ = score_interpretation(interp, "ruin_keeper")
    assert score >= SCORE_PASS, score


# ── Память ────────────────────────────────────────────────────────────


def test_template_repeat_flagged():
    codes = [c for c, _p, _r in check_template(
        "Ты спрашиваешь о нём, а лес шумит о тебе.",
        ["мусор", "Ты спрашиваешь о нём, а лес шумит о тебе!"])]
    assert codes and codes[0] == "template-repeat", codes


def test_template_different_ok():
    assert check_template("Совершенно другой заход про камень",
                          ["Ты спрашиваешь о нём, а лес шумит о тебе."]) == []


# ── Починка ───────────────────────────────────────────────────────────


def test_repair_note_lists_every_reason_once():
    note = build_repair_note(
        ["contrast-eto", "lexicon:нит", "lexicon:нит", "spark-no-fire"])
    assert note.count("нит") == 1, note
    assert "Схему JSON сохрани" in note, note


# ── v3: добивка лекции (образец B, Искра) ────────────────────────────


def test_contrast_ane_caught():
    from core.voice_gate import find_slop
    assert any(code == "contrast-ane" for code, _ in find_slop(
        "Карта говорит о влечении, а не о судьбе"))


def test_card_talk_forms_caught():
    from core.voice_gate import find_slop
    assert any(code == "card-talk" for code, _ in find_slop(
        "Карта говорит о влечении и выборе"))
    assert any(code == "card-talk" for code, _ in find_slop(
        "карта ведёт к тому, что выбор на его стороне"))
    # драматичное «Карты говорят «да»» — приём, а не учебник
    assert not any(code == "card-talk" for code, _ in find_slop(
        "Карты говорят «да». А теперь главный вопрос"))


def test_card_talk_repeats_stack_capped():
    from core.voice_gate import score_example
    score, reasons = score_example(
        "Карта говорит о влечении. Карта указывает на выбор. "
        "Карта ведёт к решению.", "", "spark_of_chaos")
    assert reasons.count("card-talk") == 1 and score == 80, (score, reasons)


def test_ruin_fire_banned():
    from core.voice_gate import score_example
    _score, reasons = score_example(
        "Между вами — живой пожар.", "", "ruin_keeper")
    assert "lexicon:пожар" in reasons, reasons


def test_lecture_as_spark_fails():
    bad = {
        "intro": "Между вами — живой пожар, но ты кормишь его ожиданием.",
        "short_answer": "Карта говорит о влечении, а не о судьбе. "
                        "Карта ведёт к тому, что выбор на его стороне.",
        "advice": "Остановись и спроси себя.",
    }
    bad_score, bad_reasons = score_interpretation(bad, "spark_of_chaos")
    assert bad_score < SCORE_PASS, (bad_score, bad_reasons)


def test_rhet_opener_only_first_sentence():
    from core.voice_gate import has_rhet_opener
    assert has_rhet_opener("Серьёзно? Ты ещё сомневаешься.")
    assert not has_rhet_opener("Карты говорят «да». А тебе это зачем?")


# ── v4: персональный роутинг ──────────────────────────────────────────


def test_order_providers_preferred_first():
    from core.llm import _order_providers
    providers = [("m1", "u1", "k1", "l1"), ("m2", "u2", "k2", "l2")]
    assert [m for m, _u, _k, _l in _order_providers(providers, ["m2"])] == ["m2", "m1"]
    assert _order_providers(providers, None) == providers
    assert _order_providers(providers, ["nope"]) == providers


def test_routing_used_by_fallback(monkeypatch):
    import core.llm as L
    seen = []
    providers = [("m1", "u1", "k1", "l1"), ("m2", "u2", "k2", "l2")]

    async def fake_call_llm(messages, model, base_url, api_key, max_tokens=2000,
                            temperature=0.8):
        seen.append(model)
        return "ok-result"

    monkeypatch.setattr(L, "_build_provider_list", lambda: list(providers))
    monkeypatch.setattr(L, "call_llm", fake_call_llm)
    import asyncio
    out = asyncio.run(L.call_llm_with_fallback([], preferred_models=["m2"]))
    assert out == "ok-result" and seen == ["m2"], seen

# ── v6: живость и анти-спам образов ──────────────────────────────────


def test_shadow_image_spam_flagged():
    from core.voice_gate import check_fingerprint
    codes = [c for c, _p, _r in check_fingerprint(
        {"intro": "Луна светит. Луна зовёт. Луна ждёт.", "short_answer": "Идём.",
         "advice": "Спи."}, "shadow_walker")]
    assert "shadow-image-spam" in codes, codes


def test_no_old_names_in_characters():
    from pathlib import Path
    raw = (Path(__file__).resolve().parent.parent / "data" / "characters.json"
           ).read_text(encoding="utf-8")
    for dead in ("Селена", "Веста", "Лилит"):
        assert dead not in raw, dead


def test_cores_have_roles_and_inventories():
    for c in CHARACTERS:
        assert len(c["diction"]["imagery"]) >= 10, c["id"]
        assert len(c.get("greetings", [])) >= 3, c["id"]
    assert "тепл" in BY_ID["ruin_keeper"]["persona"]
    assert "хлеб" in BY_ID["ruin_keeper"]["diction"]["imagery"]


# ── v7: добивка fossil-лексики из v6 ─────────────────────────────────


def test_traktovka_label_caught():
    from core.voice_gate import find_slop
    assert any(code == "card-talk" for code, _ in find_slop(
        "Трактовка: Влюблённые прямо говорят о выборе"))


def test_soglasno_caught():
    from core.voice_gate import find_slop
    assert any(code == "throat" for code, _ in find_slop(
        "Согласно карте, шанс есть"))


def test_shepchut_banned_for_spark():
    from core.voice_gate import check_lexicon
    assert any(w == "шепч" for w, _p, _r in check_lexicon(
        "Влюблённые прямо шепчут: возвращение возможно", "spark_of_chaos"))


def test_latin_leak_caught():
    from core.voice_gate import find_latin, score_interpretation
    assert find_latin("Его энергия течёт к reunion") == ["reunion"]
    _score, reasons = score_interpretation(
        {"intro": "Тихо.", "short_answer": "Течёт к reunion.",
         "advice": "Жди."}, "shadow_walker")
    assert "latin-leak" in reasons, reasons


# ── v8: бюджет времени починок (E1 в проде) ───────────────────────────


def test_should_retry_matrix():
    from core.llm import (
        MAX_QUALITY_ATTEMPTS,
        QUALITY_TIME_BUDGET_S,
        SCORE_PASS,
        should_retry,
    )
    assert QUALITY_TIME_BUDGET_S < 180  # фронт E1 на 180с — бюджет строго меньше
    assert should_retry(1, SCORE_PASS - 1, 10.0) is True
    assert should_retry(1, SCORE_PASS, 10.0) is False
    assert should_retry(MAX_QUALITY_ATTEMPTS, 0, 10.0) is False
    assert should_retry(1, 0, QUALITY_TIME_BUDGET_S + 1) is False
