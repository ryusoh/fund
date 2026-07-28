import re

with open('js/transactions/terminal/handlers/misc.js', 'r') as f:
    content = f.read()

# Fix the string formatting to make coverage match exactly what was expected by the CI
fix = """    if (!isAbs) {
        if (baseChart === 'sectors') {
            return 'Sector allocation chart is already showing percentages.';
        } else if (baseChart === 'marketcap') {
            return 'Market cap chart is already showing percentages.';
        } else {
            return `${baseChart.charAt(0).toUpperCase() + baseChart.slice(1)} chart is already showing percentages.`;
        }
    }"""

content = re.sub(r'    if \(!isAbs\) \{[\s\S]*?\} chart is already showing percentages.`;\n    \}', fix, content, count=1)

with open('js/transactions/terminal/handlers/misc.js', 'w') as f:
    f.write(content)
