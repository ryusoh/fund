def fix_file(file_path):
    with open(file_path, "r") as f:
        content = f.read()
    content = content.replace("zip(securities, qtys, trade_values, order_types)", "zip(securities, qtys, trade_values, order_types, strict=False)")
    with open(file_path, "w") as f:
        f.write(content)
fix_file("tests/python/benchmark_ratios.py")
