/* Builds the results workbook. Three sheets:
   - Summary:      one row per team, points per round, running total after each round, and a check column.
   - By question:  every team's points on every question, with the round, multiplier and base points above.
   - Answer log:   every answer that was recorded (what, how fast, how many points).
   Round totals on the Summary sheet are live formulas over the By question sheet, so the two always reconcile. */
(function () {
  const roundLabel = (rounds, i) => `${i + 1}. ${rounds[i].name || 'Round ' + (i + 1)}`;

  Quiz.buildResults = function ({ title, code, questions, rounds, rows, hist, meta, answers, players }) {
    const X = XLSX, col = X.utils.encode_col, n = questions.length, m = rounds.length;
    const BQ = "'By question'", lastQ = col(n + 1), totQ = col(n + 2);
    const num = (v, f) => ({ t: 'n', v, f });

    /* ---- By question ---- */
    const a = [
      ['', 'Round', ...questions.map(q => roundLabel(rounds, q.r)), ''],
      ['', 'Multiplier', ...questions.map(q => q.mult), ''],
      ['', 'Base points', ...questions.map(q => q.points), ''],
      ['', 'Maximum (base × multiplier)', ...questions.map(q => Math.round(q.points * q.mult)), ''],
      ['', 'Correct answer', ...questions.map(q => q.answer), ''],
      ['Rank', 'Team', ...questions.map((_, i) => 'Q' + (i + 1)), 'Total'],
    ];
    rows.forEach((r, k) => {
      const e = 7 + k;
      a.push([r.rank, r.name, ...questions.map((_, i) => (hist[i] ? hist[i][r.pid] || 0 : '')), num(r.total, `SUM(C${e}:${lastQ}${e})`)]);
    });
    const byQ = X.utils.aoa_to_sheet(a);
    byQ['!cols'] = [{ wch: 6 }, { wch: 28 }, ...questions.map(() => ({ wch: 9 })), { wch: 10 }];

    /* ---- Summary ---- */
    const head = ['Rank', 'Team', ...rounds.map((r, i) => roundLabel(rounds, i) + (r.mult !== 1 ? ` (×${r.mult})` : '')), 'Total',
      ...rounds.map((_, i) => `Running total after round ${i + 1}`), 'Total from By question sheet', 'Difference (should be 0)'];
    const s = [[title], [`Game ${code}`, new Date().toLocaleString('en-CA')], [], head];
    rows.forEach((r, k) => {
      const e = 5 + k, b = 7 + k, first = 'C', lastR = col(1 + m), tot = col(2 + m);
      let run = 0;
      s.push([r.rank, r.name,
        ...rounds.map((_, j) => num(r.byRound[j], `SUMIF(${BQ}!$C$1:$${lastQ}$1,"${roundLabel(rounds, j).replace(/"/g, '""')}",${BQ}!$C${b}:$${lastQ}${b})`)),
        num(r.total, `SUM(${first}${e}:${lastR}${e})`),
        ...rounds.map((_, j) => num(run += r.byRound[j], `SUM($${first}${e}:${col(2 + j)}${e})`)),
        num(r.total, `${BQ}!${totQ}${b}`),
        num(0, `${tot}${e}-${col(3 + 2 * m)}${e}`)]);
    });
    const sum = X.utils.aoa_to_sheet(s);
    sum['!cols'] = [{ wch: 6 }, { wch: 28 }, ...head.slice(2).map(h => ({ wch: Math.max(12, Math.min(30, h.length + 2)) }))];

    /* ---- Answer log ---- */
    const log = [['Question', 'Round', 'Team', 'Answer', 'Correct answer', 'Result', 'Seconds taken', 'Base points', 'Multiplier', 'Points']];
    const byName = Object.keys(players).sort((x, y) => players[x].name.localeCompare(players[y].name));
    questions.forEach((q, i) => {
      if (!hist[i]) return;
      const got = (answers && answers[i]) || {}, mt = (meta && meta[i]) || {};
      byName.forEach(pid => {
        const g = got[pid];
        const secs = g && g.t && mt.startAt ? Math.max(0, Math.round((g.t - mt.startAt) / 10) / 100) : '';
        log.push(['Q' + (i + 1), roundLabel(rounds, q.r), players[pid].name, g ? g.c : '', q.answer,
          mt.skipped ? 'Skipped' : !g ? 'No answer' : g.c === q.answer ? (hist[i][pid] ? 'Correct' : 'Correct but late') : 'Wrong',
          secs, q.points, q.mult, hist[i][pid] || 0]);
      });
    });
    const logWs = X.utils.aoa_to_sheet(log);
    logWs['!cols'] = [{ wch: 9 }, { wch: 22 }, { wch: 28 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 11 }, { wch: 10 }, { wch: 9 }];

    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, sum, 'Summary');
    X.utils.book_append_sheet(wb, byQ, 'By question');
    X.utils.book_append_sheet(wb, logWs, 'Answer log');
    return wb;
  };

  /* A ready-to-edit questions workbook with the three sheets the host screen understands. */
  Quiz.buildTemplate = function (sample) {
    const X = XLSX, wb = X.utils.book_new();
    const add = (rows, name, widths) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({ wch: w })); X.utils.book_append_sheet(wb, ws, name); };
    add(sample.q, 'Questions', [52, 16, 16, 16, 16, 8, 8, 6, 40, 6, 6, 7, 6]);
    add(sample.rounds, 'Rounds', [8, 24, 11]);
    add(sample.intro, 'Intro', [10, 80]);
    return wb;
  };
})();
