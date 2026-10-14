import os
import pytest
from scripts.studio_budget import Budget, BudgetExceeded
from scripts.studio_api import prepare_environment, database_namespace
from scripts.dev_studio import check_ports
import socket


def test_fixture_environment_cannot_spend_or_use_real_bot(tmp_path):
    env = prepare_environment(
        "fixture",
        tmp_path / "fixture.sqlite3",
        {"BOT_TOKEN": "real", "OPENROUTER_API_KEY": "real", "OPENCODE_ZEN_ENABLED": "true", "ADMIN_IDS": "777"},
    )
    assert env["BOT_TOKEN"] == "123456:arcanum-studio-only"
    assert env["OPENROUTER_API_KEY"] == "fixture-disabled"
    assert env["OPENCODE_ZEN_ENABLED"] == "false"
    assert env["ADMIN_IDS"] == "919191"
    assert env["DB_PATH"] == str(tmp_path / "fixture.sqlite3")


def test_namespace_persistent_and_explicit_reset(tmp_path):
    path = tmp_path / "fixture.sqlite3"
    first = database_namespace(path)
    assert database_namespace(path) == first
    assert database_namespace(path, reset=True) != first


def test_budget_reserves_before_call_across_restart_and_bounds(tmp_path):
    path = tmp_path / "budget.sqlite3"
    b = Budget(path, max_calls=2, max_usd=0.01)
    b.reserve(0.006)
    with pytest.raises(BudgetExceeded):
        b.reserve(0.005)
    Budget(path, max_calls=2, max_usd=0.01).reserve(0.004)
    with pytest.raises(BudgetExceeded):
        Budget(path, max_calls=2, max_usd=0.01).reserve(0.00001)
    with pytest.raises(ValueError):
        Budget(path, max_calls=0, max_usd=99)


def test_occupied_port_detected_without_killing_listener():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen()
        port = sock.getsockname()[1]
        with pytest.raises(RuntimeError, match=str(port)):
            check_ports([port])
        assert sock.fileno() >= 0
