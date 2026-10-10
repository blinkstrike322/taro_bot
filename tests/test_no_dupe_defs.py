# tests/test_no_dupe_defs.py
# Регрессия на бой 09.10.2026: сборщик Amvera смержил в storage/db.py
# повторный блок определений (_migrate_schema, init_db, get_db, ...),
# второе определение перекрыло правильное и молча откатило миграции
# (streak-колонки не создавались, весь API сыпал 500). AST-проверка:
# топ-уровень модулей не должен содержать дублей имён.
import ast
from pathlib import Path

import storage.db as sdb


def _top_level_func_names(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return [
        node.name
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]


def test_no_duplicate_top_level_functions():
    for module_file in (Path(sdb.__file__), Path(sdb.__file__).parent.parent / "app.py"):
        names = _top_level_func_names(module_file)
        dupes = sorted({n for n in names if names.count(n) > 1})
        assert not dupes, f"{module_file.name}: duplicate top-level defs {dupes}"


def test_migrate_schema_defined_once_with_streak():
    names = _top_level_func_names(Path(sdb.__file__))
    assert names.count("_migrate_schema") == 1
    assert "streak_days" in Path(sdb.__file__).read_text(encoding="utf-8")
