
=============================================================
🚀 RUNNING SCENARIO: 01_simple_liquidation
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 02_tiny_unprofitable
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 03_race_condition
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 04_multi_collateral
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 05_multi_debt
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 06_close_factor
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 07_sequential_liquidation
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 08_no_liquidity
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 09_high_slippage
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 10_no_flash
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 11_rpc_failure
=============================================================

=============================================================
🚀 RUNNING SCENARIO: 12_gas_spike
=============================================================
{"timestamp":"2026-10-03T04:44:33.989Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 112.89ms. Best decision: ABORT_ERROR (NO_SWAP_ROUTE)"}
{"timestamp":"2026-10-03T04:44:33.991Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 275.14ms. Best decision: EXECUTE (Profitable: $1346.88)"}
{"timestamp":"2026-10-03T04:44:33.992Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 251.34ms. Best decision: SKIP_MARGINAL (Marginal Profit: $0.10 (< $1))"}
{"timestamp":"2026-10-03T04:44:33.993Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 230.88ms. Best decision: ABORT_ERROR (GAS_ESTIMATE_FAILED: execution reverted)"}
{"timestamp":"2026-10-03T04:44:33.994Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 163.65ms. Best decision: EXECUTE (Profitable: $490.00)"}
{"timestamp":"2026-10-03T04:44:33.995Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 143.14ms. Best decision: EXECUTE (Profitable: $242.50)"}
🚫 EVALUATION: SKIP (ABORT_ERROR - NO_SWAP_ROUTE)
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: ABORT_ERROR, Got: ABORT_ERROR)
=============================================================

{"timestamp":"2026-10-03T04:44:33.999Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 97.79ms. Best decision: SKIP_UNPROFITABLE (Unprofitable: $-10.00)"}
{"timestamp":"2026-10-03T04:44:34.000Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 73.05ms. Best decision: ABORT_ERROR (GAS_ESTIMATE_FAILED: execution reverted)"}
{"timestamp":"2026-10-03T04:44:34.001Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 25.79ms. Best decision: SKIP_UNPROFITABLE (Unprofitable: $-174.06)"}
✅ EVALUATION: EXECUTE
   Gross Revenue: $62.50
   Gas Cost:      $2.50
   Net Profit:    $1346.88
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: EXECUTE, Got: EXECUTE)
=============================================================

🚫 EVALUATION: SKIP (SKIP_MARGINAL - Marginal Profit: $0.10 (< $1))
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: SKIP, Got: SKIP_MARGINAL)
=============================================================

🚫 EVALUATION: SKIP (ABORT_ERROR - GAS_ESTIMATE_FAILED: execution reverted)
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: ABORT_ERROR, Got: ABORT_ERROR)
=============================================================

✅ EVALUATION: EXECUTE
   Gross Revenue: $500.00
   Gas Cost:      $5.00
   Net Profit:    $490.00
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: EXECUTE, Got: EXECUTE)
=============================================================

✅ EVALUATION: EXECUTE
   Gross Revenue: $250.00
   Gas Cost:      $5.00
   Net Profit:    $242.50
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: EXECUTE, Got: EXECUTE)
=============================================================

🚫 EVALUATION: SKIP (SKIP_UNPROFITABLE - Unprofitable: $-10.00)
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: SKIP, Got: SKIP_UNPROFITABLE)
=============================================================

🚫 EVALUATION: SKIP (ABORT_ERROR - GAS_ESTIMATE_FAILED: execution reverted)
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: ABORT_ERROR, Got: ABORT_ERROR)
=============================================================

❌ ERROR: RPC Timeout
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: ERROR, Got: ERROR)
=============================================================

🚫 EVALUATION: SKIP (SKIP_UNPROFITABLE - Unprofitable: $-174.06)
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: SKIP, Got: SKIP_UNPROFITABLE)
=============================================================

{"timestamp":"2026-10-03T04:44:34.036Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 252.43ms. Best decision: EXECUTE (Profitable: $1346.88)"}
{"timestamp":"2026-10-03T04:44:34.037Z","level":"INFO","component":"ProfitCalc","message":"Evaluated all pairs in 228.54ms. Best decision: EXECUTE (Profitable: $1346.88)"}
✅ EVALUATION: EXECUTE
   Gross Revenue: $93.75
   Gas Cost:      $2.50
   Net Profit:    $1346.88
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: EXECUTE, Got: EXECUTE)
=============================================================

✅ EVALUATION: EXECUTE
   Gross Revenue: $62.50
   Gas Cost:      $2.50
   Net Profit:    $1346.88
-------------------------------------------------------------
RESULT: ✅ PASS (Expected: EXECUTE, Got: EXECUTE)
=============================================================

