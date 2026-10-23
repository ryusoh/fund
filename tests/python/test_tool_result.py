def test_tool_result_validation():
    from scripts.filings.engine.tool_result import (
        build_error,
        build_success,
        validate_tool_result_contract,
    )

    assert validate_tool_result_contract({"ok": True, "value": 123}) is None
    assert validate_tool_result_contract(build_success(123)) is None

    assert validate_tool_result_contract({"ok": False, "error": "ERR", "message": "msg"}) is None
    assert validate_tool_result_contract(build_error("ERR", "msg")) is None

    assert validate_tool_result_contract(None) == "tool result must be dict"
    assert (
        validate_tool_result_contract({"ok": True})
        == 'successful tool result must contain field "value"'
    )
    assert (
        validate_tool_result_contract({"ok": False})
        == 'failed tool result must contain non-empty string field "error"'
    )

    # Coverage for missing lines (probably error/message string checks)
    assert (
        validate_tool_result_contract({"ok": False, "error": 123})
        == 'failed tool result must contain non-empty string field "error"'
    )
    assert (
        validate_tool_result_contract({"ok": False, "error": "", "message": "msg"})
        == 'failed tool result must contain non-empty string field "error"'
    )
    assert (
        validate_tool_result_contract({"ok": False, "error": "ERR", "message": 123})
        == 'failed tool result must contain non-empty string field "message"'
    )
    assert (
        validate_tool_result_contract({"ok": False, "error": "ERR", "message": ""})
        == 'failed tool result must contain non-empty string field "message"'
    )
    assert (
        validate_tool_result_contract({"ok": False, "error": "ERR", "message": "msg", "hint": 123})
        == 'tool result field "hint" must be string'
    )

    assert (
        validate_tool_result_contract({"ok": True, "value": 1, "meta": "not-dict"})
        == 'tool result field "meta" must be dict'
    )
    assert (
        validate_tool_result_contract({"ok": True, "value": 1, "truncation": "not-dict"})
        == 'tool result field "truncation" must be dict'
    )
    assert (
        validate_tool_result_contract({"ok": "not-bool"})
        == 'tool result must contain boolean field "ok"'
    )
