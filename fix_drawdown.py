import sys
content = sys.stdin.read()
import re
search = """import { jest } from '@jest/globals';
import {
    buildDrawdownSeries,
    drawDrawdownChart,
} from '../../../js/transactions/chart/renderers/drawdown.js';"""

replace = """import { buildDrawdownSeries } from '../../../js/transactions/chart/renderers/drawdown.js';
import { drawDrawdownChart } from '../../../js/transactions/chart/renderers/drawdown.js';
import { jest } from '@jest/globals';"""
print(content.replace(search, replace).strip() + "\n")
