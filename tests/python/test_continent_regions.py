from scripts.analysis.continent_regions import (
    aggregate_by_continent,
    aggregate_by_subregion,
    format_summary_report,
    get_hierarchical_breakdown,
)


def test_aggregate_by_continent():
    country_data = {"United States": 45.0, "Canada": 5.0, "Japan": 10.0, "Unknown Country": 2.0}
    result = aggregate_by_continent(country_data)
    assert result["North America"] == 50.0
    assert result["Asia"] == 10.0
    assert result["Other"] == 2.0


def test_aggregate_by_subregion():
    country_data = {"United States": 45.0, "Canada": 5.0, "Japan": 10.0, "Unknown Country": 2.0}
    result = aggregate_by_subregion(country_data)
    assert result["Northern America"] == 50.0
    assert result["East Asia"] == 10.0
    assert result["Other"] == 2.0


def test_get_hierarchical_breakdown():
    country_data = {"United States": 45.0, "Canada": 5.0, "Japan": 10.0, "Unknown Country": 2.0}
    result = get_hierarchical_breakdown(country_data)
    assert result["North America"]["total"] == 50.0
    assert result["North America"]["subregions"]["Northern America"]["total"] == 50.0
    assert (
        result["North America"]["subregions"]["Northern America"]["countries"]["United States"]
        == 45.0
    )
    assert result["Asia"]["total"] == 10.0
    assert result["Other"]["total"] == 2.0


def test_format_summary_report():
    country_data = {"United States": 45.0, "Japan": 10.0, "Unknown Country": 2.0}
    report = format_summary_report(country_data)
    assert "PORTFOLIO GEOGRAPHIC ALLOCATION" in report
    assert "North America" in report
    assert "Northern America" in report
    assert "United States" in report
    assert "Unknown Country" in report


def test_main_execution():
    import runpy

    # Run the module as __main__
    runpy.run_module('scripts.analysis.continent_regions', run_name='__main__')
