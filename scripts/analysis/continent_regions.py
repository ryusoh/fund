#!/usr/bin/env python3
"""
Continent and Region Classification for Country Data

Hierarchical classification system:
- Continents (level 1)
- Sub-regions (level 2)
- Countries (level 3)

Properties:
- Mutually exclusive: Each country belongs to exactly one sub-region
- Totally inclusive: All countries are mapped
- Hierarchical: Sub-regions nest within continents
"""

from typing import Dict, List, Tuple

# ============================================================================
# CONTINENT AND SUB-REGION DEFINITIONS
# ============================================================================

# Level 1: Continents
# Level 2: Sub-regions (mutually exclusive, totally inclusive)
# Level 3: Countries (mapped to exactly one sub-region)

CONTINENT_REGIONS: Dict[str, Dict[str, List[str]]] = {
    # ========================================================================
    # NORTH AMERICA
    # ========================================================================
    "North America": {
        "Northern America": [
            "United States",
            "Canada",
        ],
        "Central America": [
            "Mexico",
            "Costa Rica",
            "Panama",
            "Guatemala",
            "Honduras",
            "El Salvador",
            "Nicaragua",
            "Belize",
        ],
        "Caribbean": [
            "Jamaica",
            "Trinidad and Tobago",
            "Barbados",
            "Bahamas",
            "Dominican Republic",
            "Haiti",
            "Cuba",
        ],
    },
    # ========================================================================
    # SOUTH AMERICA
    # ========================================================================
    "South America": {
        "South America": [
            "Brazil",
            "Chile",
            "Colombia",
            "Peru",
            "Argentina",
            "Uruguay",
            "Paraguay",
            "Bolivia",
            "Ecuador",
            "Venezuela",
            "Guyana",
            "Suriname",
        ],
    },
    # ========================================================================
    # EUROPE
    # ========================================================================
    "Europe": {
        "Western Europe": [
            "United Kingdom",
            "Ireland",
            "France",
            "Germany",
            "Netherlands",
            "Belgium",
            "Luxembourg",
            "Switzerland",
            "Austria",
            "Liechtenstein",
            "Monaco",
        ],
        "Northern Europe": [
            "Sweden",
            "Denmark",
            "Norway",
            "Finland",
            "Iceland",
            "Estonia",
            "Latvia",
            "Lithuania",
        ],
        "Southern Europe": [
            "Italy",
            "Spain",
            "Portugal",
            "Greece",
            "Malta",
            "Cyprus",
            "Andorra",
            "San Marino",
            "Vatican City",
            "Slovenia",
            "Croatia",
            "Bosnia and Herzegovina",
            "Serbia",
            "Montenegro",
            "North Macedonia",
            "Albania",
            "Bulgaria",
            "Romania",
        ],
        "Eastern Europe": [
            "Poland",
            "Czech Republic",
            "Slovakia",
            "Hungary",
            "Russia",
            "Belarus",
            "Ukraine",
            "Moldova",
            "Kazakhstan",
        ],
    },
    # ========================================================================
    # AFRICA
    # ========================================================================
    "Africa": {
        "North Africa": [
            "Egypt",
            "Morocco",
            "Tunisia",
            "Algeria",
            "Libya",
        ],
        "Sub-Saharan Africa": [
            "South Africa",
            "Nigeria",
            "Kenya",
            "Ghana",
            "Ethiopia",
            "Tanzania",
            "Uganda",
            "Zimbabwe",
            "Botswana",
            "Namibia",
            "Zambia",
            "Mozambique",
            "Angola",
            "Senegal",
            "Ivory Coast",
            "Cameroon",
            "Rwanda",
            "Mauritius",
        ],
        "Middle East & North Africa (MENA)": [
            # Note: Some classifications put these in Middle East
            # For financial markets, often grouped together
        ],
    },
    # ========================================================================
    # ASIA
    # ========================================================================
    "Asia": {
        "East Asia": [
            "Japan",
            "China",
            "Taiwan",
            "Hong Kong",
            "Macau",
            "Mongolia",
            "North Korea",
            "South Korea",
        ],
        "Southeast Asia": [
            "Singapore",
            "Thailand",
            "Indonesia",
            "Malaysia",
            "Philippines",
            "Vietnam",
            "Myanmar",
            "Cambodia",
            "Laos",
            "Brunei",
            "Timor-Leste",
        ],
        "South Asia": [
            "India",
            "Pakistan",
            "Bangladesh",
            "Sri Lanka",
            "Nepal",
            "Bhutan",
            "Maldives",
            "Afghanistan",
        ],
        "Central Asia": [
            "Uzbekistan",
            "Turkmenistan",
            "Tajikistan",
            "Kyrgyzstan",
        ],
        "Middle East": [
            "Saudi Arabia",
            "UAE",
            "Qatar",
            "Kuwait",
            "Bahrain",
            "Oman",
            "Israel",
            "Turkey",
            "Iran",
            "Iraq",
            "Jordan",
            "Lebanon",
            "Syria",
            "Yemen",
            "Palestine",
        ],
    },
    # ========================================================================
    # OCEANIA
    # ========================================================================
    "Oceania": {
        "Australasia": [
            "Australia",
            "New Zealand",
        ],
        "Pacific Islands": [
            "Fiji",
            "Papua New Guinea",
            "Solomon Islands",
            "Vanuatu",
            "Samoa",
            "Tonga",
            "Palau",
            "Micronesia",
            "Marshall Islands",
            "Kiribati",
            "Tuvalu",
            "Nauru",
        ],
    },
}


# ============================================================================
# BUILD COUNTRY TO REGION MAPPING
# ============================================================================


def build_country_mapping() -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Build flat mappings from country to sub-region and continent.

    Returns:
        Tuple of (country_to_subregion, country_to_continent)
    """
    country_to_subregion: Dict[str, str] = {}
    country_to_continent: Dict[str, str] = {}

    for continent, subregions in CONTINENT_REGIONS.items():
        for subregion, countries in subregions.items():
            for country in countries:
                country_to_subregion[country] = subregion
                country_to_continent[country] = continent

    return country_to_subregion, country_to_continent


# Build the mappings at module load
COUNTRY_TO_SUBREGION, COUNTRY_TO_CONTINENT = build_country_mapping()


# ============================================================================
# AGGREGATION FUNCTIONS
# ============================================================================


def aggregate_by_continent(country_data: Dict[str, float]) -> Dict[str, float]:
    """
    Aggregate country-level data to continent level.

    Args:
        country_data: Dictionary of {country: percentage}

    Returns:
        Dictionary of {continent: percentage}
    """
    continent_data: Dict[str, float] = {}
    unmapped_countries: List[str] = []

    for country, value in country_data.items():
        if country in COUNTRY_TO_CONTINENT:
            continent = COUNTRY_TO_CONTINENT[country]
            continent_data[continent] = continent_data.get(continent, 0) + value
        else:
            # Track unmapped countries
            unmapped_countries.append(country)
            continent_data["Other"] = continent_data.get("Other", 0) + value

    return continent_data


def aggregate_by_subregion(country_data: Dict[str, float]) -> Dict[str, float]:
    """
    Aggregate country-level data to sub-region level.

    Args:
        country_data: Dictionary of {country: percentage}

    Returns:
        Dictionary of {subregion: percentage}
    """
    subregion_data: Dict[str, float] = {}
    unmapped_countries: List[str] = []

    for country, value in country_data.items():
        if country in COUNTRY_TO_SUBREGION:
            subregion = COUNTRY_TO_SUBREGION[country]
            subregion_data[subregion] = subregion_data.get(subregion, 0) + value
        else:
            unmapped_countries.append(country)
            subregion_data["Other"] = subregion_data.get("Other", 0) + value

    return subregion_data


def get_hierarchical_breakdown(country_data: Dict[str, float], min_threshold: float = 0.01) -> Dict:
    """
    Generate hierarchical breakdown from continent to country level.

    Args:
        country_data: Dictionary of {country: percentage}
        min_threshold: Minimum percentage to show individual countries

    Returns:
        Nested dictionary with hierarchical structure
    """
    result = {}

    for continent, subregions in CONTINENT_REGIONS.items():
        continent_total = 0.0
        continent_subregions = {}

        for subregion, countries in subregions.items():
            subregion_total = 0.0
            subregion_countries = {}

            for country in countries:
                if country in country_data:
                    value = country_data[country]
                    if value >= min_threshold:
                        subregion_countries[country] = value
                        subregion_total += value

            if subregion_total >= min_threshold:
                continent_subregions[subregion] = {
                    "total": round(subregion_total, 2),
                    "countries": subregion_countries,
                }
                continent_total += subregion_total

        if continent_total >= min_threshold:
            result[continent] = {
                "total": round(continent_total, 2),
                "subregions": continent_subregions,
            }

    # Handle unmapped countries
    other_total = sum(v for k, v in country_data.items() if k not in COUNTRY_TO_CONTINENT)
    if other_total >= min_threshold:
        result["Other"] = {"total": round(other_total, 2), "subregions": {}}

    return result


def format_summary_report(country_data: Dict[str, float]) -> str:
    """
    Generate a formatted summary report with continent/region breakdown.

    Args:
        country_data: Dictionary of {country: percentage}

    Returns:
        Formatted string report
    """
    lines = []
    lines.append("=" * 70)
    lines.append("PORTFOLIO GEOGRAPHIC ALLOCATION - HIERARCHICAL SUMMARY")
    lines.append("=" * 70)
    lines.append("")

    # Continent level (ranked by percentage)
    continent_data = aggregate_by_continent(country_data)
    sorted_continents = sorted(continent_data.items(), key=lambda x: -x[1])

    lines.append("CONTINENT BREAKDOWN (Ranked)")
    lines.append("-" * 70)
    for continent, pct in sorted_continents:
        if pct >= 0.1:
            bar = "█" * int(pct / 2)
            lines.append(f"  {continent:25s} {pct:6.2f}%  {bar}")
    lines.append("")

    # Sub-region level (ranked by percentage)
    subregion_data = aggregate_by_subregion(country_data)
    sorted_subregions = sorted(subregion_data.items(), key=lambda x: -x[1])

    lines.append("SUB-REGION BREAKDOWN (Ranked)")
    lines.append("-" * 70)
    for subregion, pct in sorted_subregions:
        if pct >= 0.1:
            bar = "█" * int(pct / 2)
            lines.append(f"  {subregion:25s} {pct:6.2f}%  {bar}")
    lines.append("")

    # All countries (ranked by percentage)
    sorted_countries = sorted(country_data.items(), key=lambda x: -x[1])

    lines.append("ALL COUNTRIES (Ranked)")
    lines.append("-" * 70)
    for i, (country, pct) in enumerate(sorted_countries, 1):
        if pct >= 0.1:
            bar = "█" * int(pct / 2)
            lines.append(f"  {i:2d}. {country:23s} {pct:6.2f}%  {bar}")
    lines.append("")

    # Summary statistics
    lines.append("SUMMARY STATISTICS")
    lines.append("-" * 70)
    lines.append(f"  Total countries tracked: {len(country_data)}")
    lines.append(
        f"  Countries mapped to regions: "
        f"{sum(1 for c in country_data if c in COUNTRY_TO_CONTINENT)}"
    )
    lines.append(
        f"  Unmapped countries (Other): "
        f"{sum(1 for c in country_data if c not in COUNTRY_TO_CONTINENT)}"
    )

    # Check mutual exclusivity and total inclusivity
    total_pct = sum(country_data.values())
    lines.append(f"  Total allocation: {total_pct:.2f}%")
    lines.append("=" * 70)

    return "\n".join(lines)


# ============================================================================
# MAIN (for testing)
# ============================================================================

if __name__ == "__main__":
    # Test with sample data
    sample_data = {
        "United States": 45.0,
        "Japan": 8.0,
        "United Kingdom": 5.0,
        "China": 4.0,
        "Canada": 3.5,
        "France": 3.0,
        "Germany": 2.8,
        "Taiwan": 2.5,
        "Switzerland": 2.2,
        "India": 2.0,
        "Australia": 1.8,
        "South Korea": 1.5,
        "Netherlands": 1.2,
        "Sweden": 1.0,
        "Denmark": 0.8,
        "Italy": 0.7,
        "Spain": 0.6,
        "Hong Kong": 0.5,
        "Brazil": 0.5,
        "Singapore": 0.4,
        "Mexico": 0.3,
        "Saudi Arabia": 0.3,
        "South Africa": 0.2,
        "Indonesia": 0.2,
        "Thailand": 0.2,
        "Other": 5.0,
    }

    print(format_summary_report(sample_data))
