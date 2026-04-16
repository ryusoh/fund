with open('tests/python/test_audit_eps_gaps.py', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "df = pd.DataFrame({'date': dates, 'ticker': ['AAPL'], 'value': [10]})" in line:
        continue
    if "dates = pd.date_range(start='2020-01-01', periods=1)" in line:
        continue
    if "# Create a DataFrame where filter will result in empty" in line:
        continue
    new_lines.append(line)

with open('tests/python/test_audit_eps_gaps.py', 'w') as f:
    f.writelines(new_lines)
