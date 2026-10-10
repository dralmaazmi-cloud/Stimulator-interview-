# Evidence log (V2 blueprint)

Access date: 2026-10-10.

## 1. Status of external verification: NOT ACHIEVED
Web search worked (returned titles, URLs and snippets). Every page fetch failed in this run:
- WebFetch to www.opm.gov, opm.gov, www.psychologicalscience.org, faculty.engineering.asu.edu, psychology.ecu.edu -> `getaddrinfo ENOTFOUND` (DNS failure through the sandbox).
- A proxy status probe suggested by the environment (curl to `$HTTPS_PROXY/__agentproxy/status`) was denied by the permission classifier; I did not work around it.
Consequence: **no external source was opened, so none is cited as evidence.** The items in section 3 are leads only. No claim in the blueprint is labelled "Documented" on the basis of an external source.

## 2. Sources actually opened (internal, approved content)
| ID | Title / file | Publisher/author | Path | What it supports |
|---|---|---|---|---|
| R | مرجع المقابلات القيادية المبنية على الكفاءات (reference.json, schema 1.0, generated 2026-10-02) | Project owner; sources V5 Alhindasi guide (75 pages, 2026) per its `sources` field | `work/dist/data/reference.json` | All statements about STAR-L, SEAL, question types, 5 interviewer questions, mistakes, self-intro, mission command (blueprint section 3). It also carries its own disclaimer that it is an independent training effort, not an official release. |
| Q | questions.json (70 items) | Project, derived | `work/dist/data/derived/questions.json` | Counts (40+16+6+6+2), `rubric_mode` as answer key for A2, `sample_answer_star_l` / `sample_answer_seal` fields for A1/A3, first-word cue check (41 of 46 STAR-L start with صف/أخبرني/اذكر/قدّم) |
| C | competencies.json | Project, derived | `work/dist/data/derived/competencies.json` | `definition`, `definition_v1_2025` for S4 and A5 |
| E | expanded-model-answers.json (header only read) | Project | `work/dist/data/expanded-model-answers.json` | Model answers approved 5 Oct 2026, framework SEAL, 70-question ecosystem; unchanged |
| L | lessons.json | Project, derived | `work/dist/data/derived/lessons.json` | Station structure U1-U5 |
| J | learn.js, competencies.js, quick-review.js, guidance.js, home.js, report.js, self-intro.js, rotation.js, storage.js, app.js | Project | `work/dist/js/` | Current behaviour, UI strings, persistence, routes (audit section 1) |
| P | Screenshots light-__home, light-__preparation, light-__preparation_U2, light-__competencies_C1 | QA baseline | `/tmp/v1-baseline/` | Visual order and density (audit 2.2) |

## 3. Candidate external sources (NOT opened; snippets only; verify before citing)
Titles and URLs are exactly as returned by search results on 2026-10-10. The "what search results said" column is the snippet-level summary only, not verification.
| ID | Candidate | URL | Why relevant | Status |
|---|---|---|---|---|
| E-L1 | Roediger and Karpicke, "Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention", Psychological Science 17(3), 249-255 (2006) | https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf | Basis for retrieval practice before reveal (answer gate, A1 missing mode, A5). Snippets: undergraduates, prose passages, benefit of testing appeared at delayed tests (2 days, 1 week) while restudy was better at 5 minutes | Unverified; generalization to adult professionals and to interview-answer knowledge is Inferred |
| E-L2 | Dunlosky, Rawson, Marsh, Nathan and Willingham, "Improving Students' Learning With Effective Learning Techniques", Psychological Science in the Public Interest 14(1), 4-58 (2013) | https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html (press release page for the paper) | Practice testing and distributed practice rated highest utility; interleaving and self-explanation moderate; rereading/highlighting low. Supports A5 spacing and A1/A2 practice | Unverified; I did not open the paper or the release |
| E-L3 | Renkl, Atkinson and Maier (fading study) and Atkinson, Derry, Renkl and Wortham, "Learning from examples: instructional principles from the worked examples research", Review of Educational Research (2000) | https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Exp_Rev_LI06.pdf (a Renkl/Atkinson-related PDF; exact title not confirmed) | Worked examples early, fading toward problem solving; expertise reversal. Supports A3 | Unverified; exact document identity not confirmed |
| E-L4 | OPM, "How do I create structured interview questions?" FAQ and OPM structured interview guidance | https://www.opm.gov/frequently-asked-questions/assessment-policy-faq/structured-interviews/how-do-i-create-structured-interview-questions/ | Search summary: questions tied to competencies, open-ended, behavioural vs situational; STAR as a way to shape questions; that is hiring-side US federal guidance | Unverified. Would support: behavioural vs situational distinction (R 1.4) and "competency-linked questions" (R 2.7) |
| E-L5 | Structured-interview literature in general (reliability/validity of structured vs unstructured interviews) | not searched | Would justify why the reference's competency approach is credible | Not researched; gap |

## 4. Claims and their status
| Claim used in blueprint | Support | Label |
|---|---|---|
| Content of STAR-L, SEAL, question types, mistakes, evaluator questions, self-intro, mission command | R (opened) | Documented, but only as "stated by the approved reference"; external correctness not verified |
| "STAR-L is the most widely adopted international model / gold standard" | R 2.1 only | Not repeated in new copy; Estimated (unverified) |
| Interviewers/models SHL, Korn Ferry, DDI, OPM base | R 1.5 only | Not repeated; unverified |
| Retrieval practice improves delayed retention | E-L1/E-L2 snippets | Inferred (principle widely reported; pages not opened) |
| Spacing and interleaving help | E-L2 snippet | Inferred |
| Worked examples then fading help novices | E-L3 snippet | Inferred |
| Leitner intervals 1/3/7 days | none | Estimated |
| Time hints (8/15/10/5 min), 60/120 s suggested splits, mastery thresholds | none | Estimated |
| First-word cue (41/46) | Q computed this run | Documented (own computation: Python over questions.json) |

## 5. Uncertainties and expert review
- Re-run research when network access works: open E-L1..E-L4, record exact title, DOI/URL, access date, and replace "Inferred" with "Documented" where the page supports it.
- Disputed or conflicting sources: none found (none opened).
- A native Arabic editor and an assessment/HR practitioner should review the new copy (blueprint section 12).
- No claim of learning effectiveness is made. Effectiveness for these learners is unproven until measured with real learners.

## Orchestrator addendum (2026-10-10): sources located via web search by the main session
The educational-architect could not reach the web from its sandbox. The main session ran web searches and located the following. Only search-result summaries were read, not the full texts, so each line states only what the search result supports.
| Claim used in blueprint | Source located | Status |
|---|---|---|
| Behavioural (past) vs situational (hypothetical) structured-interview questions; answers should cover situation/task, action, result (supports A2 and STAR framing) | U.S. OPM, Structured Interviews guide: https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/structured-interviews.pdf ; OPM FAQ "How do I create structured interview questions?": https://www.opm.gov/frequently-asked-questions/assessment-policy-faq/structured-interviews/how-do-i-create-structured-interview-questions/ | Located (official); content seen via search summary |
| Retrieval practice beats re-study for long-term retention (supports A5 flashcards, A1 drills) | Roediger & Karpicke (2006), "Test-Enhanced Learning", Psychological Science 17(3):249-255; summary: https://cft.vanderbilt.edu/?p=22452 | Located; full text not opened; do not quote percentages |
| Worked examples with gradual fading help novices (supports A3) | Renkl & Atkinson (2003) Educational Psychologist; Renkl, Atkinson & Große (2004) Instructional Science; overview: https://faculty.engineering.asu.edu/mre/wp-content/uploads/sites/31/2020/02/Exp_Rev_LI06.pdf | Located; full text not opened |
STAR-L's "L" (learning) element and SEAL remain the project's own approved frameworks (reference.json); no external source was sought for them.
