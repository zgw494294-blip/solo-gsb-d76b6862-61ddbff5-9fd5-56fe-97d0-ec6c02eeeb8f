"""漏读时间窗推测测试：固定用例 + 随机数据与逐秒暴力枚举对拍。

对拍方法（独立参考实现）：对每个“两条不同门记录 + 缺失门”组合，在小区间内
逐秒枚举虚拟读数秒数 t，直接判定
  1) t 与这两条记录能否组成合格趟（两段耗时落在闭区间内）；
  2) 把该虚拟记录加入后，用记忆化递归求出的最大计次数是否恰好 = 原最大值 + 1。
满足两条的 t 集合必须与 find_missing 返回的闭区间完全一致。
"""

import functools
import json
import random
import sys

sys.path.insert(0, ".")
from app.adjudication import (
    AdjudicationError,
    Record,
    _build_trips,
    adjudicate,
    find_missing,
    parse_payload,
)

RANGES = {"SM": (10, 60), "MF": (10, 60)}


def payload_of(spec, runners=(1,), ranges=RANGES):
    return {
        "standards": {
            "smMin": ranges["SM"][0], "smMax": ranges["SM"][1],
            "mfMin": ranges["MF"][0], "mfMax": ranges["MF"][1],
        },
        "runners": [{"number": r} for r in runners],
        "records": [
            {"id": i, "runner": r, "gate": g, "time": t} for i, r, g, t in spec
        ],
    }


def hints_of(spec, runners=(1,), ranges=RANGES):
    out = find_missing(payload_of(spec, runners, ranges))
    return out["runners"]


def best_count(records, ranges, forced_ids=None):
    """独立参考实现：记忆化递归求最大完整链趟数（与生产 DP 不同写法）。

    forced_ids 给定时，只统计包含“恰好由这三条记录组成的那一趟”的链
    （漏读判定要求：补读与这两条记录组成的那一趟本身就在 K+1 方案里）。
    """
    trips = _build_trips(records, ranges)
    n = len(trips)
    forced = set(forced_ids) if forced_ids else None
    NEG = -10**9

    @functools.lru_cache(maxsize=None)
    def solve(i, bound, pending):
        # pending=True 表示链中还必须包含目标趟。
        if i >= n:
            return NEG if pending else 0
        best = solve(i + 1, bound, pending)
        t = trips[i]
        if t.s.time > bound:
            is_target = forced is not None and set(t.ids) == forced
            tail = solve(i + 1, t.f.time, pending and not is_target)
            best = max(best, 1 + tail)
        return best

    return solve(0, -1, forced is not None)


def brute_window(mine, ranges, pair_ids, missing_gate, t_limit):
    """逐秒暴力：返回使“与这两条记录成趟、且包含该趟的整套方案增次”的全部秒数。"""
    k0 = best_count(mine, ranges)
    by_id = {r.id: r for r in mine}
    a, b = (by_id[i] for i in pair_ids)
    sm_lo, sm_hi = ranges["SM"]
    mf_lo, mf_hi = ranges["MF"]
    ok = set()
    for t in range(t_limit + 1):
        virt = Record(id="__virt__", runner=a.runner, gate=missing_gate, time=t)
        lap = {"S": None, "M": None, "F": None}
        for rec in (a, b, virt):
            lap[rec.gate] = rec
        s, m, f = lap["S"], lap["M"], lap["F"]
        if not (sm_lo <= m.time - s.time <= sm_hi):
            continue
        if not (mf_lo <= f.time - m.time <= mf_hi):
            continue
        # 包含“这两条记录 + 虚拟读数”那一趟的合法方案须达到原最大值 + 1。
        if best_count(mine + [virt], ranges, (a.id, b.id, virt.id)) == k0 + 1:
            ok.add(t)
    return ok


def check_window_consistency(spec, runner, ranges, t_limit):
    """对拍核心：返回的每个闭区间都与逐秒暴力集合完全一致，且无遗漏。"""
    mine = [Record(id=i, runner=r, gate=g, time=t) for i, r, g, t in spec if r == runner]
    out = find_missing(payload_of(spec, (runner,), ranges))["runners"][0]
    got = {}
    for h in out["hints"]:
        key = (tuple(r["id"] for r in h["records"]), h["missingGate"])
        assert key not in got, f"重复窗口: {key}"
        lo, hi = h["timeMin"], h["timeMax"]
        assert isinstance(lo, int) and isinstance(hi, int) and 0 <= lo <= hi, h
        got[key] = set(range(lo, hi + 1))
    # 枚举全部“两条不同门记录 + 缺失门”组合逐秒对拍
    ids_by_gate = {"S": [], "M": [], "F": []}
    for r in mine:
        ids_by_gate[r.gate].append(r.id)
    combos = []
    for sa in ids_by_gate["S"]:
        for ma in ids_by_gate["M"]:
            combos.append(((sa, ma), "F"))
    for sa in ids_by_gate["S"]:
        for fa in ids_by_gate["F"]:
            combos.append(((sa, fa), "M"))
    for ma in ids_by_gate["M"]:
        for fa in ids_by_gate["F"]:
            combos.append(((ma, fa), "S"))
    for pair_ids, gate in combos:
        expect = brute_window(mine, ranges, pair_ids, gate, t_limit)
        actual = got.pop((pair_ids, gate), set())
        # 暴力只扫到 t_limit：窗口上界之外的部分截断后比较
        actual = {t for t in actual if t <= t_limit}
        assert actual == expect, (
            f"pair={pair_ids} gate={gate}: 返回区间 {sorted(actual)} != 暴力 {sorted(expect)}"
        )
    assert not got, f"返回了暴力不可行的窗口: {got.keys()}"


def test_missing_f_basic():
    # 现方案 1 趟 (a1,b1,c1)；a2(30)+b2(45) 缺 F：t-45 ∈ [10,60] 且后续无其他趟，
    # 前置 1 趟 + 新趟 = 2 = 1+1 → 窗口 [55, 105]。
    spec = [
        ("a1", 1, "S", 0), ("b1", 1, "M", 12), ("c1", 1, "F", 25),
        ("a2", 1, "S", 30), ("b2", 1, "M", 45),
    ]
    runners = hints_of(spec)
    assert runners[0]["lapCount"] == 1
    hs = runners[0]["hints"]
    assert len(hs) == 1, hs
    h = hs[0]
    assert h["missingGate"] == "F"
    assert [r["id"] for r in h["records"]] == ["a2", "b2"]
    assert (h["timeMin"], h["timeMax"]) == (55, 105), h
    print("test_missing_f_basic OK")


def test_missing_f_window_truncated_by_suffix():
    # 现方案 2 趟：(a1,b1,c1) 与 (a2,b2,c2)。补 F 给 (aX,bX)=(50,65)：
    # 新趟 (50,65,t) 需要前置 2 趟？不行——前置终点 < 50 只有 1 趟 (c1=25)，
    # 第二趟终点 c2=57 不小于 50。故须 前置1 + 新1 + 后置1 = 3：
    # 后置 1 趟要求 t < 某趟起点……没有更晚的趟了，target = 2-1 = 1，
    # 后缀计数为 1 的 t 区间是 [26, +∞)（起点 30 的趟须 > t）→ t <= 29。
    # 与合格区间 [75, 125] 求交为空 → 该对不返回。
    # 改让 (aX,bX) = (26,40)：前置 1（c1=25 < 26），t ∈ [50,100]，
    # 后缀计数须为 1：t < 30（a2 起点）→ t ∈ [50, 29] 空？也不返回。
    # 用 (aX,bX) = (58,70)：前置 2（c2=57 < 58），target = 0，
    # 后缀计数为 0 → t >= 30（最大起点）→ 窗口 [80,130] ∩ [30,∞) = [80,130]。
    spec = [
        ("a1", 1, "S", 0), ("b1", 1, "M", 12), ("c1", 1, "F", 25),
        ("a2", 1, "S", 30), ("b2", 1, "M", 45), ("c2", 1, "F", 57),
        ("aX", 1, "S", 58), ("bX", 1, "M", 70),
    ]
    runners = hints_of(spec)
    assert runners[0]["lapCount"] == 2
    hs = [h for h in runners[0]["hints"] if h["missingGate"] == "F"]
    assert len(hs) == 1, hs
    assert [r["id"] for r in hs[0]["records"]] == ["aX", "bX"]
    assert (hs[0]["timeMin"], hs[0]["timeMax"]) == (80, 130), hs[0]
    print("test_missing_f_window_truncated_by_suffix OK")


def test_missing_m_basic():
    # 缺 M：已有 S@30、F@57；t ∈ [40,90] ∩ [-3,47] = [40,47]；
    # 前置 1（c1=25<30）+ 新 1 + 后置 0 = 2 = 现 1 + 1。
    spec = [
        ("a1", 1, "S", 0), ("b1", 1, "M", 12), ("c1", 1, "F", 25),
        ("a2", 1, "S", 30), ("c2", 1, "F", 57),
    ]
    runners = hints_of(spec)
    hs = [h for h in runners[0]["hints"] if h["missingGate"] == "M"]
    assert len(hs) == 1, hs
    assert [r["id"] for r in hs[0]["records"]] == ["a2", "c2"]
    assert (hs[0]["timeMin"], hs[0]["timeMax"]) == (40, 47), hs[0]
    print("test_missing_m_basic OK")


def test_missing_s_basic_and_nonneg_clamp():
    # 缺 S：已有 M@12、F@25；t ∈ [12-60, 12-10] ∩ [0,∞) = [0,2]（非负截断）；
    # 现方案 0 趟（没有 S 记录），补读后 0+1 = 1。
    spec = [("b1", 1, "M", 12), ("c1", 1, "F", 25)]
    runners = hints_of(spec)
    assert runners[0]["lapCount"] == 0
    hs = runners[0]["hints"]
    assert len(hs) == 1 and hs[0]["missingGate"] == "S", hs
    assert [r["id"] for r in hs[0]["records"]] == ["b1", "c1"]
    assert (hs[0]["timeMin"], hs[0]["timeMax"]) == (0, 2), hs[0]
    print("test_missing_s_basic_and_nonneg_clamp OK")


def test_missing_s_window_truncated_by_prefix():
    # 现方案 1 趟 (a1,b1,c1)=(0,12,25)。已有 M@40、F@55，缺 S：
    # t ∈ [40-60, 30] ∩ [0,∞) = [0,30]；后置 0，target = 1-0 = 1，
    # 前缀计数为 1 须 t > 25（c1 终点）→ t ∈ [26,30]。
    spec = [
        ("a1", 1, "S", 0), ("b1", 1, "M", 12), ("c1", 1, "F", 25),
        ("b2", 1, "M", 40), ("c2", 1, "F", 55),
    ]
    runners = hints_of(spec)
    hs = [h for h in runners[0]["hints"] if h["missingGate"] == "S"]
    assert len(hs) == 1, hs
    assert [r["id"] for r in hs[0]["records"]] == ["b2", "c2"]
    assert (hs[0]["timeMin"], hs[0]["timeMax"]) == (26, 30), hs[0]
    print("test_missing_s_window_truncated_by_prefix OK")


def test_no_increase_pairs_omitted():
    # 两条记录已同在最优方案的一趟里：补读无法增次，不返回。
    spec = [
        ("a1", 1, "S", 0), ("b1", 1, "M", 12), ("c1", 1, "F", 25),
    ]
    runners = hints_of(spec)
    assert runners[0]["lapCount"] == 1
    assert runners[0]["hints"] == [], runners[0]["hints"]
    print("test_no_increase_pairs_omitted OK")


def test_sorting_order():
    # 排序：编号数值升序 → 缺失门 S/M/F → 两条 ID 依门序的序列字典序。
    # 102 只有 M/F（缺 S 窗口 [0,2]）；7 有 M/F 与 S/M 两组（缺 S [0,2]、缺 F [122,172]，
    # 两组秒数互不匹配，现方案 0 趟）；40 无解。编号数值 7 < 40 < 102，与录入顺序无关。
    spec = [
        ("mB", 102, "M", 12), ("fB", 102, "F", 25),
        ("mA", 7, "M", 12), ("fA", 7, "F", 25),
        ("sA", 7, "S", 100), ("mZ", 7, "M", 112),
        ("sC", 40, "S", 0), ("mC", 40, "M", 5),
    ]
    out = find_missing(payload_of(spec, runners=(102, 40, 7)))
    assert [r["runner"] for r in out["runners"]] == [7, 40, 102]
    r7, r40, r102 = out["runners"]
    assert r40["hints"] == []
    assert [(h["missingGate"], tuple(x["id"] for x in h["records"]), h["timeMin"], h["timeMax"])
            for h in r7["hints"]] == [
        ("S", ("mA", "fA"), 0, 2), ("F", ("sA", "mZ"), 122, 172),
    ], r7["hints"]
    assert [(h["missingGate"], tuple(x["id"] for x in h["records"])) for h in r102["hints"]] == [
        ("S", ("mB", "fB")),
    ]
    # 同门多条记录时按 ID 序列字典序：sA/sZ 两条 S 与 mA 配对，sA 在前。
    spec2 = [
        ("sZ", 1, "S", 0), ("sA", 1, "S", 0), ("mA", 1, "M", 12),
    ]
    hs = hints_of(spec2)[0]["hints"]
    assert [tuple(x["id"] for x in h["records"]) for h in hs] == [("sA", "mA"), ("sZ", "mA")], hs
    print("test_sorting_order OK")


def test_big_numbers_lossless():
    # 超过 2^53 的编号与秒数：窗口端点精确计算、JSON 原样返回，不截断。
    big = 9007199254740993
    ts, tm = 9007199254740992, 9007199254741003  # 差 11
    spec = [
        ("s1", big, "S", ts), ("m1", big, "M", tm),
        ("f0", big, "F", 25),  # 孤立终点，保证现方案 0 趟
    ]
    out = find_missing(payload_of(spec, runners=(big,)))
    assert out["runners"][0]["runner"] == big
    h = out["runners"][0]["hints"][0]
    assert h["missingGate"] == "F"
    assert (h["timeMin"], h["timeMax"]) == (tm + 10, tm + 60), h
    text = json.dumps(out)
    assert str(tm + 10) in text and str(big) in text
    print("test_big_numbers_lossless OK")


def test_validation_identical():
    # 与裁决同一套校验：非法输入抛 AdjudicationError。
    bad = {
        "standards": {"smMin": 10, "smMax": 9, "mfMin": 10, "mfMax": 60},
        "runners": [{"number": 1}],
        "records": [],
    }
    try:
        find_missing(bad)
        raise AssertionError("非法输入应报错")
    except AdjudicationError:
        pass
    # 41 条记录同样拒绝（虚拟读数不占用名额，但输入校验不变）。
    too_many = {
        "standards": {"smMin": 10, "smMax": 60, "mfMin": 10, "mfMax": 60},
        "runners": [{"number": 1}],
        "records": [
            {"id": f"r{i}", "runner": 1, "gate": "S", "time": 0} for i in range(41)
        ],
    }
    try:
        find_missing(too_many)
        raise AssertionError("41 条应报错")
    except AdjudicationError:
        pass
    print("test_validation_identical OK")


def test_every_second_forms_lap_and_increases():
    # 固定小数据上直接核对“每个秒数都成趟且增次、且覆盖全部可行秒数”。
    spec = [
        ("a1", 1, "S", 0), ("b1", 1, "M", 12), ("c1", 1, "F", 25),
        ("a2", 1, "S", 30), ("b2", 1, "M", 45), ("c2", 1, "F", 57),
        ("x1", 1, "M", 33), ("x2", 1, "S", 26), ("x3", 1, "F", 90),
    ]
    check_window_consistency(spec, 1, RANGES, t_limit=200)
    print("test_every_second_forms_lap_and_increases OK")


def test_fuzz_against_bruteforce():
    for seed in range(300):
        rng = random.Random(10_000 + seed)
        n = rng.randint(2, 12)
        tmax = rng.choice((60, 90, 160))
        spec = [
            (f"r{i:02d}", 1, rng.choice("SMF"), rng.randint(0, tmax))
            for i in range(n)
        ]
        ranges = {
            "SM": (rng.randint(1, 15), rng.randint(16, 60)),
            "MF": (rng.randint(1, 15), rng.randint(16, 60)),
        }
        check_window_consistency(spec, 1, ranges, t_limit=tmax + 130)
    print("test_fuzz_against_bruteforce OK (300 组)")


def test_adjudicate_unaffected():
    # 漏读推测是纯只读：裁决结果不受任何影响（同输入两次裁决一致）。
    spec = [
        ("a1", 1, "S", 0), ("b1", 1, "M", 12), ("c1", 1, "F", 25),
        ("a2", 1, "S", 30), ("b2", 1, "M", 45),
    ]
    before = adjudicate(payload_of(spec))
    find_missing(payload_of(spec))
    after = adjudicate(payload_of(spec))
    assert before == after
    print("test_adjudicate_unaffected OK")


if __name__ == "__main__":
    test_missing_f_basic()
    test_missing_f_window_truncated_by_suffix()
    test_missing_m_basic()
    test_missing_s_basic_and_nonneg_clamp()
    test_missing_s_window_truncated_by_prefix()
    test_no_increase_pairs_omitted()
    test_sorting_order()
    test_big_numbers_lossless()
    test_validation_identical()
    test_every_second_forms_lap_and_increases()
    test_fuzz_against_bruteforce()
    test_adjudicate_unaffected()
    print("ALL FIND-MISSING TESTS PASSED")
