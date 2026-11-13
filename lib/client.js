window.__ModuleLoader__.load({
	id: "dsh-second-look",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		// src/client/reviewer-catalog.ts
		/** A failed catalog must never clear or replace a saved custom model route. */
		async function loadReviewerCatalog(remote) {
			try {
				const response = await remote.session?.modelCatalog();
				return response?.ok && response.value ? {
					ok: true,
					value: response.value
				} : { ok: false };
			} catch {
				return { ok: false };
			}
		}
		// src/client/nav-icon.ts
		/** Shield and checkmark in the settings row's current theme color. */
		function SettingsNavIcon({ size = 16 }) {
			return (0, react.createElement)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.25,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			}, (0, react.createElement)("path", { d: "M8 1.75 13 3.6v4.1c0 3-2 5.15-5 6.55-3-1.4-5-3.55-5-6.55V3.6L8 1.75Z" }), (0, react.createElement)("path", { d: "m5.5 8 1.65 1.65 3.4-3.4" }));
		}
		function registerSettingsNavIcon(ctx) {
			ctx.slots.inject("settings.section.icon", () => ctx.slots.register({
				name: "settings.section.icon",
				id: "second-look"
			}, SettingsNavIcon));
		}
		// src/client/ReviewerRoute.tsx
		/** Unknown saved routes remain visible and editable even when discovery fails. */
		function ReviewerRoute({ id, value, inherited, catalog, disabled, t, onChange }) {
			const [manual, setManual] = (0, react.useState)(false);
			const [effortReset, setEffortReset] = (0, react.useState)(false);
			const groups = catalog?.groups ?? [];
			const provider = value.provider || inherited?.provider || "";
			const model = value.model || inherited?.model || "";
			const models = groups.find((group) => group.id === provider)?.models ?? [];
			const selected = models.find((item) => item.id === model);
			const efforts = selected?.reasoning?.efforts ?? [];
			const inheritedLabel = inherited ? t("settings.inheritBase") : t("settings.providerDefault");
			const update = (key, next) => {
				const changed = {
					...value,
					[key]: next
				};
				if (key === "provider") changed.model = "";
				if (key === "provider" || key === "model") {
					changed.effort = "";
					setEffortReset(value.effort !== "");
				} else setEffortReset(false);
				onChange(changed);
			};
			const input = (key, label, placeholder) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "sl-modelField",
				htmlFor: `${id}-${key}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(label) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: "sl-input",
					id: `${id}-${key}`,
					value: value[key],
					disabled,
					onChange: (event) => update(key, event.target.value),
					placeholder,
					autoComplete: "off",
					spellCheck: false
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sl-routeEditor",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sl-modelFields",
						children: manual || !catalog ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [input("provider", "settings.providerSelect", inherited?.provider || t("settings.chooseProvider")), input("model", "settings.modelSelect", inherited?.model || t("settings.chooseModel"))] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "sl-modelField",
							htmlFor: `${id}-provider`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.providerSelect") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "sl-input",
								id: `${id}-provider`,
								value: value.provider,
								disabled,
								onChange: (e) => update("provider", e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: inherited ? `${inheritedLabel}${inherited.provider ? ` · ${inherited.provider}` : ""}` : t("settings.chooseProvider")
									}),
									value.provider && !groups.some((g) => g.id === value.provider) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: value.provider,
										children: [
											value.provider,
											" · ",
											t("settings.currentCustom")
										]
									}),
									groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: group.id,
										children: group.name
									}, group.id))
								]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "sl-modelField",
							htmlFor: `${id}-model`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.modelSelect") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "sl-input",
								id: `${id}-model`,
								value: value.model,
								disabled: disabled || !provider,
								onChange: (e) => update("model", e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: inherited ? `${inheritedLabel}${inherited.model ? ` · ${inherited.model}` : ""}` : t("settings.chooseModel")
									}),
									value.model && !models.some((m) => m.id === value.model) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: value.model,
										children: [
											value.model,
											" · ",
											t("settings.currentCustom")
										]
									}),
									models.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: item.id,
										children: item.name
									}, item.id))
								]
							})]
						})] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sl-effortRow",
						children: [manual || !selected?.reasoning ? input("effort", "settings.reasoningSelect", inherited ? inheritedLabel : t("settings.effortDefault")) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "sl-modelField",
							htmlFor: `${id}-effort`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.reasoningSelect") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "sl-input",
								id: `${id}-effort`,
								disabled,
								value: value.effort,
								onChange: (e) => update("effort", e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: inherited ? inheritedLabel : t("settings.effortDefault")
									}),
									value.effort && !efforts.some((item) => item.id === value.effort) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: value.effort,
										children: [
											value.effort,
											" · ",
											t("settings.currentCustom")
										]
									}),
									efforts.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: item.id,
										children: reasoningLabel(item.id, t, item.name)
									}, item.id))
								]
							})]
						}), catalog && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "sl-textButton",
							disabled,
							onClick: () => setManual((current) => !current),
							children: t(manual ? "settings.pickFromList" : "settings.manualEntry")
						})]
					}),
					effortReset ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-inlineHint",
						role: "status",
						children: t("settings.effortCleared")
					}) : !manual && selected && !selected.reasoning ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-inlineHint",
						children: t("settings.reasoningManual")
					}) : null
				]
			});
		}
		function reasoningLabel(id, t, fallback = id) {
			return [
				"off",
				"none",
				"minimal",
				"low",
				"medium",
				"high",
				"max",
				"xhigh"
			].includes(id) ? t(`settings.effort.${id}`) : fallback;
		}
		// src/client/audit-view.ts
		function auditCategory(record) {
			if (record.decision === "human-settled") return record.humanOutcome === "allowed-once" ? "allow" : record.humanOutcome === "rejected" ? "deny" : "failure";
			if (record.decision === "exempt") return "exempt";
			if (record.decision === "allow") return "allow";
			if (record.decision === "ask_user" || record.decision === "rule-ask") return "ask";
			if (record.decision === "deny" || record.decision === "rule-deny" || record.decision === "guard-blocked" || record.decision === "outbound-blocked") return "deny";
			if (record.decision.startsWith("failure-") || record.decision === "cancelled") return "failure";
			return "other";
		}
		/** Group only one call in one session. Retain every transition, including its reason. */
		function groupAudit(records) {
			const entries = /* @__PURE__ */ new Map();
			for (const [index, record] of [...records].sort((a, b) => b.at - a.at).entries()) {
				const key = record.callId && record.sessionId ? JSON.stringify([
					record.sessionId,
					record.callId,
					record.toolName
				]) : JSON.stringify([
					"ungrouped",
					index,
					record.at
				]);
				const entry = entries.get(key);
				if (entry) entry.records.push(record);
				else entries.set(key, {
					key,
					latest: record,
					records: [record],
					category: auditCategory(record)
				});
			}
			return [...entries.values()];
		}
		function exportAudit(records, scope = "recent") {
			return JSON.stringify({
				exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
				scope,
				retention: scope === "blocked" ? "persistent, newest 100 blocked events" : "in-memory, newest 500 events",
				records: records.map((r) => ({
					at: r.at,
					sessionId: r.sessionId,
					callId: r.callId,
					toolName: r.toolName,
					tier: r.tier,
					model: r.model,
					...r.decision === "outbound-blocked" ? { modelRole: "destination" } : {},
					decision: r.decision,
					reason: r.reason,
					durationMs: r.durationMs,
					usage: r.usage,
					humanOutcome: r.humanOutcome,
					configVersion: r.configVersion
				}))
			}, null, 2);
		}
		// src/client/AuditPanel.tsx
		const AUDIT_STYLES = `
.sl-audit-search{flex:1;min-width:180px;height:36px;padding:0 10px;border:1px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.sl-audit-search:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}

.sl-audit{margin-top:28px;padding-top:22px;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
.sl-audit-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.sl-audit h3{margin:0;font-size:16px;font-weight:600}.sl-audit p{margin:4px 0}
.sl-audit-muted{color:var(--dsw-alias-label-secondary);font-size:13px}
.sl-audit-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.sl-audit button,.sl-audit select{font:inherit;font-size:13px;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l4);border-radius:6px;min-height:32px;padding:4px 12px;cursor:pointer}
.sl-audit button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sl-audit button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);font-weight:600}
.sl-audit button:disabled{opacity:.5;cursor:default}.sl-audit :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.sl-audit-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:16px 0 8px}
.sl-audit-empty{padding:24px 0;text-align:center}.sl-audit-error{color:var(--dsw-alias-state-error-primary)}
.sl-audit-confirm{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 0}
.sl-audit-entry{border-top:1px solid var(--dsw-alias-border-l2)}
.sl-audit-entry summary{cursor:pointer;list-style:none;padding:12px 0}.sl-audit-entry summary::-webkit-details-marker{display:none}
.sl-audit-topline{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.sl-audit-time{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.sl-audit-badge{font-size:12px;line-height:20px;padding:0 7px;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);font-weight:500}
.sl-audit-entry[data-category="deny"] .sl-audit-badge,.sl-audit-entry[data-category="failure"] .sl-audit-badge{color:var(--dsw-alias-state-error-primary)}
.sl-audit-entry[data-category="ask"] .sl-audit-badge{color:var(--dsw-alias-state-business-primary)}
.sl-audit-reason{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:13px}
.sl-audit-chevron{font-size:16px;color:var(--dsw-alias-label-secondary);transition:transform .12s}.sl-audit-entry[open] .sl-audit-chevron{transform:rotate(90deg)}
.sl-audit-detail{padding:0 0 14px;font-size:13px;overflow-wrap:anywhere}.sl-audit-step{padding:8px 0}.sl-audit-step p{white-space:pre-wrap}.sl-audit-meta{display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--dsw-alias-label-secondary)}
.sl-audit-footer{padding-top:12px;display:flex;gap:8px}
@media(max-width:600px){.sl-audit-head{display:block}.sl-audit-actions{margin-top:12px}.sl-audit-topline{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px}.sl-audit-time{grid-column:1 / -1;grid-row:2;margin-left:0}.sl-audit-chevron{grid-column:3;grid-row:1}.sl-audit-toolbar{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.sl-audit-chevron{transition:none}}
`;
		function label(record) {
			if (record.decision === "human-settled") return record.humanOutcome === "allowed-once" ? "audit.humanAllow" : record.humanOutcome === "rejected" ? "audit.humanDeny" : record.humanOutcome === "cancelled" ? "audit.cancelled" : "audit.unavailable";
			if (record.decision === "cancelled") return "audit.cancelled";
			if (record.decision.startsWith("failure-")) return "audit.failed";
			return {
				"guard-blocked": "audit.guardBlocked",
				"outbound-blocked": "audit.outboundBlocked",
				exempt: "audit.exempt",
				allow: "audit.allow",
				ask_user: "audit.ask",
				deny: "audit.deny",
				"rule-deny": "audit.ruleDeny",
				"rule-ask": "audit.ruleAsk",
				"settings-changed": "audit.settings"
			}[record.decision] ?? "audit.other";
		}
		function time(at, locale) {
			return new Date(at).toLocaleString(locale);
		}
		function AuditPanel({ t, audit, clearAudit, enabled = true }) {
			const [recent, setRecent] = (0, react.useState)([]);
			const [blocked, setBlocked] = (0, react.useState)([]);
			const [scope, setScope] = (0, react.useState)("recent");
			const [persistenceDegraded, setPersistenceDegraded] = (0, react.useState)(false);
			const records = scope === "blocked" ? blocked : recent;
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [confirm, setConfirm] = (0, react.useState)(false);
			const [search, setSearch] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [limit, setLimit] = (0, react.useState)(5);
			const active = (0, react.useRef)(false);
			const pending = (0, react.useRef)(false);
			const serial = (0, react.useRef)(0);
			const load = (0, react.useCallback)(async () => {
				if (pending.current) return;
				pending.current = true;
				const version = ++serial.current;
				setBusy(true);
				try {
					const result = await audit();
					if (!active.current || version !== serial.current) return;
					if (!result.ok || !Array.isArray(result.records)) {
						setError("audit.loadFailed");
						return;
					}
					setRecent(result.records);
					setBlocked(result.blockedRecords ?? []);
					setPersistenceDegraded(result.persistenceDegraded ?? false);
					setLoaded(true);
					setError(null);
				} catch {
					if (active.current && version === serial.current) setError("audit.loadFailed");
				} finally {
					if (active.current && version === serial.current) {
						pending.current = false;
						setBusy(false);
					}
				}
			}, [audit]);
			(0, react.useEffect)(() => {
				if (!enabled) return;
				active.current = true;
				pending.current = false;
				load();
				const timer = setInterval(() => {
					if (document.visibilityState !== "hidden") load();
				}, 1e4);
				return () => {
					active.current = false;
					++serial.current;
					clearInterval(timer);
				};
			}, [load, enabled]);
			const clear = async () => {
				if (pending.current) return;
				pending.current = true;
				const version = ++serial.current;
				setBusy(true);
				setError(null);
				setNotice(null);
				try {
					const result = await clearAudit(scope);
					if (!active.current || version !== serial.current) return;
					if (!result.ok) {
						setError("audit.clearFailed");
						return;
					}
					if (scope === "blocked") {
						setBlocked([]);
						setPersistenceDegraded(false);
					} else setRecent([]);
					setLoaded(true);
					setConfirm(false);
					setNotice("audit.cleared");
				} catch {
					if (active.current && version === serial.current) setError("audit.clearFailed");
				} finally {
					if (active.current && version === serial.current) {
						pending.current = false;
						setBusy(false);
					}
				}
			};
			const download = () => {
				let url;
				try {
					const blob = new Blob([exportAudit(records, scope)], { type: "application/json;charset=utf-8" });
					url = URL.createObjectURL(blob);
					const anchor = document.createElement("a");
					anchor.href = url;
					anchor.download = `second-look-audit-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`;
					document.body.appendChild(anchor);
					try {
						anchor.click();
					} finally {
						anchor.remove();
					}
					setError(null);
				} catch {
					setError("audit.exportFailed");
				} finally {
					if (url) {
						const release = url;
						setTimeout(() => URL.revokeObjectURL(release), 1e3);
					}
				}
			};
			const entries = groupAudit(records);
			const query = search.trim().toLocaleLowerCase();
			const filtered = entries.filter((entry) => (filter === "all" || entry.category === filter) && (!query || entry.records.some((record) => [
				record.toolName,
				record.reason,
				record.sessionId,
				record.callId
			].some((value) => value?.toLocaleLowerCase().includes(query)))));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "sl-audit",
				"aria-label": t("audit.title"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: AUDIT_STYLES }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sl-audit-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("audit.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "sl-audit-muted",
							children: t("audit.description")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "sl-audit-actions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: busy,
									onClick: () => {
										setNotice(null);
										load();
									},
									children: t("audit.refresh")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !records.length,
									onClick: download,
									children: t("audit.export")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: busy || !records.length,
									onClick: () => setConfirm(true),
									children: t("audit.clear")
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sl-audit-actions",
						"aria-label": t("audit.historyScope"),
						children: ["recent", "blocked"].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": scope === value,
							disabled: busy,
							onClick: () => {
								setScope(value);
								setFilter("all");
								setLimit(5);
								setConfirm(false);
								setNotice(null);
							},
							children: t(value === "recent" ? "audit.recent" : "audit.blocked")
						}, value))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-audit-muted",
						children: t(scope === "blocked" ? "audit.blockedRetention" : "audit.retention")
					}),
					persistenceDegraded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-audit-error",
						role: "alert",
						children: t("audit.persistenceFailed")
					}),
					confirm && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sl-audit-confirm",
						role: "group",
						"aria-label": t("audit.confirmText"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("audit.confirmText") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy,
								onClick: () => void clear(),
								children: t("audit.confirm")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: busy,
								onClick: () => setConfirm(false),
								children: t("audit.cancel")
							})
						]
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-audit-error",
						role: "alert",
						children: t(error)
					}),
					notice && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-audit-muted",
						role: "status",
						children: t(notice)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sl-audit-toolbar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "search",
								className: "sl-audit-search",
								"aria-label": t("audit.searchLabel"),
								placeholder: t("audit.search"),
								value: search,
								onChange: (event) => {
									setSearch(event.target.value);
									setLimit(5);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "sl-audit-muted",
								children: [
									t("audit.filter"),
									" ",
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										value: filter,
										onChange: (e) => {
											setFilter(e.target.value);
											setLimit(5);
										},
										children: [
											"all",
											"exempt",
											"allow",
											"ask",
											"deny",
											"failure",
											"other"
										].map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: key,
											children: t(key === "allow" ? "audit.filterAllow" : key === "deny" ? "audit.filterDeny" : `audit.${key}`)
										}, key))
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "sl-audit-muted",
								children: [
									filtered.length,
									" ",
									t("audit.calls"),
									" · ",
									records.length,
									" ",
									t("audit.events")
								]
							})
						]
					}),
					!loaded && !error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-audit-empty",
						children: t("audit.loading")
					}) : loaded && filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-audit-empty sl-audit-muted",
						children: t(records.length ? "audit.searchEmpty" : "audit.empty")
					}) : null,
					filtered.slice(0, limit).map((entry) => {
						const record = entry.latest;
						const reason = entry.records.find((r) => r.decision !== "human-settled")?.reason ?? record.reason;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: "sl-audit-entry",
							"data-category": entry.category,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sl-audit-topline",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "sl-audit-badge",
										children: t(label(record))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: record.toolName }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
										className: "sl-audit-time",
										dateTime: new Date(record.at).toISOString(),
										children: time(record.at, t("audit.locale"))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										"aria-hidden": "true",
										className: "sl-audit-chevron",
										children: "›"
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "sl-audit-reason",
								children: reason
							})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sl-audit-detail",
								children: [[...entry.records].reverse().map((step, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sl-audit-step",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(label(step)) }),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "sl-audit-muted",
											children: time(step.at, t("audit.locale"))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: step.reason }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "sl-audit-meta",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t(step.decision === "outbound-blocked" ? "audit.destinationModel" : "audit.model"),
													": ",
													step.model || "—"
												] }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t("audit.duration"),
													": ",
													step.durationMs === null ? t("audit.unknown") : `${(step.durationMs / 1e3).toFixed(1)} ${t("audit.seconds")}`
												] }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													t("audit.tier"),
													": ",
													step.tier === "daily" ? t("audit.daily") : step.tier === "strict" ? t("audit.strict") : step.tier
												] })
											]
										})
									]
								}, i)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sl-audit-muted",
									children: [
										t("audit.session"),
										": ",
										record.sessionId || "—",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
										t("audit.call"),
										": ",
										record.callId || "—"
									]
								})]
							})]
						}, entry.key);
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sl-audit-footer",
						children: [filtered.length > limit && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setLimit((n) => n + 25),
							children: t("audit.more")
						}), limit > 5 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setLimit(5),
							children: t("audit.less")
						})]
					})
				]
			});
		}
		// src/client/SettingsCard.tsx
		/**
		* Modified for dsh-second-look, 2026-10-31 (部署后补: 客户端内置设置面板;
		* 2026-11-02 oil-ui 存量优化 — quiet operations console).
		*
		* The in-client settings section: independent reviewer route (provider,
		* model, manual reasoning-effort id), the strict-tier override, the two-tier
		* budgets. Session tiers are selected in the composer permission menu.
		* Names, budgets and effort ids only — the Host-side store rejects
		* credential-shaped keys/values.
		*/
		const NUMERIC_KEYS = /* @__PURE__ */ new Set([
			"evidenceRoundsDaily",
			"totalTimeoutMsDaily",
			"maxEvidenceItemsDaily",
			"evidenceRoundsStrict",
			"totalTimeoutMsStrict",
			"maxEvidenceItemsStrict"
		]);
		const CSS_TAG = "@deepseek-ai/dsh-second-look/SettingsCard.css";
		const STYLES$1 = `
.sl-wrap{display:flex;flex-direction:column;padding:4px 0 32px;color:var(--dsw-alias-label-primary)}
.sl-head{position:sticky;top:0;z-index:5;padding:4px 0 12px;background:var(--dsw-alias-bg-layer-1);border-bottom:0.5px solid var(--dsw-alias-border-l2)}
.sl-headRow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.sl-brand{display:flex;align-items:center;gap:10px;min-width:0}
.sl-mark{display:grid;place-items:center;width:28px;height:28px;flex:none;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-size:15px;font-weight:700}
.sl-title{margin:0;font-size:20px;font-weight:650;line-height:28px;letter-spacing:-.01em;color:var(--dsw-alias-label-primary)}
.sl-headActions{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex:none}
.sl-saveState{display:flex;align-items:center;gap:6px;max-width:180px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.sl-saveState:before{content:"";width:6px;height:6px;flex:none;border-radius:50%;background:var(--dsw-alias-state-warn-primary)}
.sl-saveStateSaved:before{background:var(--dsw-alias-state-success-primary)}
.sl-saveStateInvalid{color:var(--dsw-alias-state-error-primary)}
.sl-saveStateInvalid:before{background:var(--dsw-alias-state-error-primary)}
.sl-save{appearance:none;min-width:72px;height:34px;padding:0 16px;border:0.5px solid transparent;border-radius:8px;background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:13px;font-weight:550;cursor:pointer;transition:transform 120ms ease,opacity 120ms ease,background 120ms ease}
.sl-save:hover:not(:disabled){opacity:.9}
.sl-save:active:not(:disabled){transform:scale(.98)}
.sl-save:disabled{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);opacity:.55;cursor:default}
.sl-save:focus-visible,.sl-reset:focus-visible,.sl-retry:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.sl-intro{padding:14px 0 12px}
.sl-blurb{margin:0;max-width:660px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sl-status{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;min-height:40px;padding:9px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-health{display:inline-flex;align-items:center;gap:7px;flex:none;color:var(--dsw-alias-label-primary);font-weight:500}
.sl-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);flex:none}
.sl-dotBad{background:var(--dsw-alias-state-error-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.sl-statusRoute{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family-mono,monospace);font-size:11px}
.sl-statusMeta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl-statusFile{margin-left:auto;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl-section{margin-top:22px;padding-top:20px;border-top:0.5px solid var(--dsw-alias-border-l2)}
.sl-sectionHead{display:flex;flex-direction:column;gap:3px;margin-bottom:6px}
.sl-sectionTitle{margin:0;font-size:14px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.sl-sectionDesc{margin:0;max-width:660px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:14px 0;border-top:0.5px solid var(--dsw-alias-border-l2)}
.sl-rowText{display:flex;flex-direction:column;gap:2px;min-width:0;cursor:pointer}
.sl-rowTitle{font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.sl-rowDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-rowDescInvalid{color:var(--dsw-alias-state-error-primary)}
.sl-control{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
.sl-input{box-sizing:border-box;width:230px;height:36px;min-width:0;padding:0 11px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;outline:none;background:var(--dsw-alias-bg-base);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);transition:border-color 120ms ease,box-shadow 120ms ease}
.sl-input:hover{border-color:var(--dsw-alias-label-secondary)}
.sl-input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}
.sl-input[aria-invalid="true"]{border-color:var(--dsw-alias-state-error-primary)}
.sl-inputNarrow{width:88px;text-align:right;font-variant-numeric:tabular-nums}
.sl-unit{flex:none;min-width:2em;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-resetSlot{display:flex;justify-content:flex-end;width:48px;flex:none}
.sl-reset{appearance:none;height:30px;padding:0 7px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.sl-reset:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sl-budgetGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.sl-budget{min-width:0;padding:0 14px 6px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.sl-budgetTitle{margin:0;padding:12px 0 10px;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.sl-budget .sl-row{grid-template-columns:minmax(0,1fr);gap:8px;padding:12px 0}
.sl-budget .sl-control{justify-content:flex-start;width:100%}
.sl-budget .sl-inputNarrow{flex:1;width:auto;min-width:0;text-align:left}
.sl-budget .sl-resetSlot{margin-left:auto}
.sl-note{margin:10px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.sl-noteError{font-size:13px;line-height:1.6;padding:10px 12px;border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,transparent);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 6%,transparent);color:var(--dsw-alias-state-error-primary)}
.sl-state{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-top:20px;padding:24px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-2);font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sl-retry{appearance:none;height:32px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
@media(max-width:720px){
  .sl-headRow{gap:10px}.sl-headActions{gap:8px}.sl-saveState{max-width:130px}.sl-mark{display:none}
  .sl-row{grid-template-columns:minmax(0,1fr);gap:8px;padding:13px 0}
  .sl-control{justify-content:flex-start;width:100%}.sl-input{flex:1;width:auto}.sl-resetSlot{margin-left:auto}
  .sl-budgetGrid{grid-template-columns:minmax(0,1fr)}
  .sl-statusFile{margin-left:0}.sl-statusMeta{max-width:100%}
}
@media(max-width:480px){.sl-saveState{display:none}.sl-title{font-size:18px}.sl-headActions{gap:6px}}
@media(prefers-reduced-motion:reduce){.sl-save,.sl-input{transition:none}}
.sl-head{padding-bottom:0;border-bottom:0}
.sl-ready{display:flex;align-items:center;gap:8px;margin:14px 0 4px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sl-readyRoute{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.sl-tabs{display:flex;gap:24px;border-bottom:1px solid var(--dsw-alias-border-l2);margin-top:12px}
.sl-tabs button{appearance:none;border:0;border-bottom:2px solid transparent;padding:10px 0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;cursor:pointer;transition:color 120ms,border-color 120ms}
.sl-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom-color:var(--dsw-alias-brand-primary)}
.sl-routeSection{padding:24px 0 18px}.sl-routeSection .sl-sectionHead{margin-bottom:20px}
.sl-modelFields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:16px}
.sl-modelField{display:flex;flex-direction:column;gap:8px;min-width:0;font-size:13px;font-weight:500}
.sl-modelField .sl-input{flex:none;width:100%;max-width:none;height:38px;border:1px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:14px}
.sl-effortRow{display:flex;align-items:flex-end;gap:16px;margin-top:18px}.sl-effortRow .sl-modelField{max-width:320px;flex:1}
.sl-textButton{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);padding:6px 0;font:inherit;font-size:13px;line-height:20px;cursor:pointer;transition:opacity 120ms,transform 120ms}
.sl-textButton:hover:not(:disabled){text-decoration:underline}.sl-textButton:active:not(:disabled){transform:translateY(1px)}.sl-textButton:disabled{opacity:.5;cursor:default}
.sl-textButton:focus-visible,.sl-tabs button:focus-visible,.sl-advanced summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}
.sl-catalogStatus{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:10px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}.sl-catalogStatus span:empty{display:none}.sl-catalogStatus button{margin-left:auto;flex:none}
.sl-strictSection{padding:18px 0;border-top:1px solid var(--dsw-alias-border-l2)}.sl-sectionRow{display:flex;align-items:center;justify-content:space-between;gap:16px}
.sl-inheritSummary,.sl-inlineHint{margin:7px 0 0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.sl-strictSection .sl-routeEditor{padding-top:16px;animation:sl-reveal 160ms ease-out}
.sl-advanced{border-top:1px solid var(--dsw-alias-border-l2);padding:18px 0}.sl-advanced summary{cursor:pointer;font-size:14px;font-weight:550}.sl-advanced summary span{margin-left:14px;font-size:13px;font-weight:400;color:var(--dsw-alias-label-secondary)}.sl-advanced .sl-budgetGrid{margin-top:18px;animation:sl-reveal 160ms ease-out}
.sl-scopeNote{margin:8px 0 0;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}
.sl-wrap [hidden]{display:none!important}.sl-noteError{margin-top:16px}.sl-saveState{font-size:13px}
@keyframes sl-reveal{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
@media(max-width:740px){.sl-modelFields{grid-template-columns:1fr}.sl-headRow{align-items:flex-start;gap:8px}.sl-headActions{flex-wrap:wrap;gap:4px 12px;max-width:65%}.sl-saveState{max-width:160px;white-space:normal}.sl-ready{flex-wrap:wrap}.sl-readyRoute{flex-basis:100%;margin-left:15px}.sl-catalogStatus{align-items:flex-start}.sl-advanced summary span{display:block;margin:6px 0 0 17px}.sl-effortRow{flex-wrap:wrap}.sl-inheritSummary{max-width:100%}}
@media(prefers-reduced-motion:reduce){.sl-routeEditor,.sl-budgetGrid{animation:none!important}.sl-textButton,.sl-tabs button,.sl-save{transition:none!important}}

`;
		function ensureStyles() {
			if (typeof document === "undefined") return;
			const previous = document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`);
			if (previous !== null) {
				if (previous.textContent !== STYLES$1) previous.textContent = STYLES$1;
				return;
			}
			const tag = document.createElement("style");
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = STYLES$1;
			document.head.appendChild(tag);
		}
		function textOf(view, key) {
			const direct = view[key];
			if (typeof direct === "string") return direct;
			const group = key.endsWith("Strict") ? view.strict : key.endsWith("Daily") ? view.daily : void 0;
			const suffix = key.startsWith("evidenceRounds") ? "evidenceRounds" : key.startsWith("totalTimeoutMs") ? "totalTimeoutMs" : "maxEvidenceItems";
			const nested = group?.[suffix];
			return typeof nested === "number" ? String(nested) : "";
		}
		function validDraft(key, draft) {
			const trimmed = draft.trim();
			if (trimmed === "") return true;
			if (!NUMERIC_KEYS.has(key)) return true;
			const parsed = Number(trimmed);
			return Number.isSafeInteger(parsed) && (key.startsWith("evidenceRounds") ? parsed >= 0 : parsed > 0);
		}
		function GateSettings(props) {
			const { t, config, saveConfig, status } = props;
			const [tab, setTab] = (0, react.useState)("settings");
			const [strictOpen, setStrictOpen] = (0, react.useState)(false);
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [catalogState, setCatalogState] = (0, react.useState)("loading");
			const catalogSerial = (0, react.useRef)(0);
			const [view, setView] = (0, react.useState)(null);
			const [drafts, setDrafts] = (0, react.useState)(() => emptyDrafts());
			const [saving, setSaving] = (0, react.useState)(false);
			const [savedAt, setSavedAt] = (0, react.useState)(null);
			const [saveError, setSaveError] = (0, react.useState)(null);
			const [loadFailed, setLoadFailed] = (0, react.useState)(false);
			const [reloadKey, setReloadKey] = (0, react.useState)(0);
			const [statusView, setStatusView] = (0, react.useState)(null);
			const alive = (0, react.useRef)(true);
			const configSerial = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				alive.current = true;
				ensureStyles();
				return () => {
					alive.current = false;
				};
			}, []);
			const refreshStatus = () => {
				status().then((result) => {
					if (alive.current) setStatusView(result);
				}).catch(() => {
					if (alive.current) setStatusView({ ok: false });
				});
			};
			const applyView = (result) => {
				setView(result);
				const next = emptyDrafts();
				for (const key of Object.keys(next)) next[key] = textOf(result, key);
				setDrafts(next);
			};
			(0, react.useEffect)(() => {
				const version = ++configSerial.current;
				config().then((result) => {
					if (!alive.current || version !== configSerial.current) return;
					if (!result.ok) {
						setLoadFailed(true);
						return;
					}
					setLoadFailed(false);
					applyView(result);
				}).catch(() => {
					if (alive.current && version === configSerial.current) setLoadFailed(true);
				});
				refreshStatus();
			}, [config, reloadKey]);
			const refreshCatalog = () => {
				const version = ++catalogSerial.current;
				setCatalogState("loading");
				(props.modelCatalog?.() ?? Promise.resolve({ ok: false })).then((result) => {
					if (!alive.current || version !== catalogSerial.current) return;
					if (result.ok) {
						setCatalog(result.value);
						setCatalogState("ready");
					} else setCatalogState("error");
				}).catch(() => {
					if (alive.current && version === catalogSerial.current) setCatalogState("error");
				});
			};
			(0, react.useEffect)(() => {
				refreshCatalog();
				return () => {
					++catalogSerial.current;
				};
			}, [props.modelCatalog]);
			const savedKeys = new Set(view?.savedKeys ?? []);
			const invalidKeys = Object.keys(drafts).filter((key) => !validDraft(key, drafts[key]));
			const dirty = view !== null && Object.keys(drafts).some((key) => drafts[key] !== (view === null ? "" : textOf(view, key)));
			const edit = (key, text) => {
				setDrafts((current) => ({
					...current,
					[key]: text
				}));
				setSavedAt(null);
				setSaveError(null);
			};
			const resetField = (key) => edit(key, "");
			const onSave = () => {
				if (saving || !dirty || invalidKeys.length > 0) return;
				setSaving(true);
				setSaveError(null);
				setSavedAt(null);
				const patch = {};
				for (const key of Object.keys(drafts)) {
					if (view !== null && drafts[key] === textOf(view, key)) continue;
					const trimmed = drafts[key].trim();
					if (trimmed === "") {
						patch[key] = null;
						continue;
					}
					if (NUMERIC_KEYS.has(key)) patch[key] = Number(trimmed);
					else patch[key] = trimmed;
				}
				saveConfig(patch).then((result) => {
					if (!alive.current) return;
					if (!result.ok) {
						setSaveError(result.error ?? "update-failed");
						setSaving(false);
						return;
					}
					applyView(result);
					setSaving(false);
					setSavedAt(Date.now());
					refreshStatus();
				}).catch(() => {
					if (!alive.current) return;
					setSaveError("connection-failed");
					setSaving(false);
				});
			};
			const field = (key, label, desc, width = "wide", placeholder, unit) => {
				const invalid = !validDraft(key, drafts[key]);
				const changed = drafts[key] !== (view === null ? "" : textOf(view, key));
				const inputId = `sl-${key}`;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sl-row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "sl-rowText",
						htmlFor: inputId,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sl-rowTitle",
							children: t(label)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `sl-rowDesc${invalid ? " sl-rowDescInvalid" : ""}`,
							id: `${inputId}-desc`,
							children: invalid ? t("settings.invalidNumber") : t(desc)
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sl-control",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: inputId,
								name: key,
								className: `sl-input${width === "narrow" ? " sl-inputNarrow" : ""}`,
								value: drafts[key],
								disabled: saving,
								placeholder: placeholder ? t(placeholder) : void 0,
								onChange: (event) => edit(key, event.target.value),
								"aria-invalid": invalid,
								"aria-describedby": `${inputId}-desc`,
								inputMode: NUMERIC_KEYS.has(key) ? "numeric" : void 0,
								autoComplete: "off",
								spellCheck: false
							}),
							unit && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sl-unit",
								children: t(unit)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sl-resetSlot",
								children: (savedKeys.has(key) || changed) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "sl-reset",
									disabled: saving,
									title: t("settings.resetHint"),
									onClick: () => resetField(key),
									children: t("settings.reset")
								})
							})
						]
					})]
				});
			};
			const budget = (tier) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sl-budget",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						className: "sl-budgetTitle",
						children: t(tier === "Daily" ? "settings.dailyLabel" : "settings.strictLabel")
					}),
					field(`evidenceRounds${tier}`, "settings.evidenceRounds", "settings.evidenceRounds.desc", "narrow", void 0, "settings.unit.rounds"),
					field(`totalTimeoutMs${tier}`, "settings.totalTimeoutMs", "settings.totalTimeoutMs.desc", "narrow", void 0, "settings.unit.ms"),
					field(`maxEvidenceItems${tier}`, "settings.maxEvidenceItems", "settings.maxEvidenceItems.desc", "narrow", void 0, "settings.unit.items")
				]
			});
			const saveState = invalidKeys.length > 0 ? "settings.invalidValues" : dirty ? "settings.unsaved" : savedAt !== null ? "settings.saved" : null;
			const baseRoute = {
				provider: drafts.reviewerModelProvider,
				model: drafts.reviewerModel,
				effort: drafts.reviewerReasoningEffort
			};
			const strictRoute = {
				provider: drafts.strictReviewerModelProvider,
				model: drafts.strictReviewerModel,
				effort: drafts.strictReviewerReasoningEffort
			};
			const setRoute = (strict, route) => {
				setDrafts((current) => strict ? {
					...current,
					strictReviewerModelProvider: route.provider,
					strictReviewerModel: route.model,
					strictReviewerReasoningEffort: route.effort
				} : {
					...current,
					reviewerModelProvider: route.provider,
					reviewerModel: route.model,
					reviewerReasoningEffort: route.effort
				});
				setSavedAt(null);
				setSaveError(null);
			};
			const hasStrict = Object.values(strictRoute).some(Boolean);
			const configured = Boolean(view?.reviewerModel && view?.reviewerModelProvider);
			const serviceOk = statusView?.ok === true && statusView.healthy === true;
			const selectTab = (next) => {
				setTab(next);
			};
			const tabKeys = ["settings", "history"];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "sl-wrap",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "sl-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sl-headRow",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sl-brand",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "sl-mark",
										"aria-hidden": "true",
										children: "✓"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
										className: "sl-title",
										children: t("settings.title")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sl-headActions",
									children: [
										saveState && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: `sl-saveState${savedAt !== null && !dirty ? " sl-saveStateSaved" : ""}${invalidKeys.length > 0 ? " sl-saveStateInvalid" : ""}`,
											role: "status",
											children: t(saveState)
										}),
										dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "sl-textButton sl-discard",
											disabled: saving,
											onClick: () => {
												if (view) applyView(view);
												setSaveError(null);
												setSavedAt(null);
											},
											children: t("settings.discard")
										}),
										(tab === "settings" || dirty) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "sl-save",
											onClick: onSave,
											disabled: !dirty || saving || invalidKeys.length > 0,
											children: saving ? t("settings.saving") : t("settings.save")
										})
									]
								})]
							}),
							view && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "sl-ready",
								"aria-label": t("settings.health"),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `sl-dot${serviceOk && configured ? "" : " sl-dotBad"}` }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(statusView?.ok === false ? "settings.statusUnavailable" : !serviceOk && statusView ? "settings.unhealthy" : configured ? "settings.configured" : "settings.notConfigured") }),
									configured && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "sl-readyRoute",
										title: `${view.reviewerModelProvider} / ${view.reviewerModel}`,
										children: [
											view.reviewerModelProvider,
											" / ",
											view.reviewerModel
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
								className: "sl-tabs",
								role: "tablist",
								"aria-label": t("settings.title"),
								children: tabKeys.map((value, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									id: `sl-tab-${value}`,
									role: "tab",
									"aria-selected": tab === value,
									"aria-controls": `sl-panel-${value}`,
									tabIndex: tab === value ? 0 : -1,
									onClick: () => selectTab(value),
									onKeyDown: (event) => {
										const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : void 0;
										if (next !== void 0) {
											event.preventDefault();
											selectTab(tabKeys[next]);
											document.getElementById(`sl-tab-${tabKeys[next]}`)?.focus();
										}
									},
									children: t(value === "settings" ? "settings.tabSettings" : "settings.tabHistory")
								}, value))
							})
						]
					}),
					saveError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "sl-note sl-noteError",
						role: "alert",
						children: t(saveError === "save-failed" ? "settings.errorStorage" : saveError === "credential-key" ? "settings.errorCredential" : [
							"invalid-value",
							"invalid-patch",
							"unknown-key"
						].includes(saveError) ? "settings.errorInput" : "settings.errorNetwork")
					}),
					view === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sl-state",
						role: loadFailed ? "alert" : "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(loadFailed ? "settings.loadFailed" : "settings.loading") }), loadFailed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "sl-retry",
							onClick: () => {
								setLoadFailed(false);
								setReloadKey((key) => key + 1);
							},
							children: t("settings.retry")
						})]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						id: "sl-panel-settings",
						role: "tabpanel",
						"aria-labelledby": "sl-tab-settings",
						hidden: tab !== "settings",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "sl-routeSection",
								"aria-labelledby": "sl-route-title",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "sl-sectionHead",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											className: "sl-sectionTitle",
											id: "sl-route-title",
											children: t("settings.modelSetup")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "sl-sectionDesc",
											children: t("settings.modelSetupHint")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewerRoute, {
										id: "sl-base",
										value: baseRoute,
										catalog,
										disabled: saving,
										t,
										onChange: (route) => setRoute(false, route)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "sl-catalogStatus",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											role: "status",
											children: catalogState === "loading" ? t("settings.catalogLoading") : catalogState === "error" ? t("settings.catalogFailed") : catalog?.failures.length ? t("settings.catalogPartial") : ""
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "sl-textButton",
											disabled: catalogState === "loading",
											onClick: refreshCatalog,
											children: t("settings.catalogRefresh")
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "sl-strictSection",
								"aria-labelledby": "sl-strict-title",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "sl-sectionRow",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											className: "sl-sectionTitle",
											id: "sl-strict-title",
											children: t("settings.enhancedModel")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "sl-textButton",
											"aria-expanded": strictOpen,
											"aria-controls": "sl-strict-editor",
											onClick: () => setStrictOpen((value) => !value),
											children: t(strictOpen ? "settings.hideRoute" : hasStrict ? "settings.editRoute" : "settings.configureSeparately")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "sl-inheritSummary",
										children: [t(hasStrict ? "settings.customRoute" : "settings.reusesBase"), hasStrict && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											" · ",
											strictRoute.provider || baseRoute.provider,
											" / ",
											strictRoute.model || baseRoute.model,
											" · ",
											t("settings.reasoningSelect"),
											": ",
											reasoningLabel(strictRoute.effort || baseRoute.effort, t) || t("settings.effortDefault"),
											" (",
											t(strictRoute.effort ? "settings.explicitEffort" : "settings.inheritBase"),
											")"
										] })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										id: "sl-strict-editor",
										hidden: !strictOpen,
										children: [
											hasStrict && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: "sl-textButton sl-resetRoute",
												disabled: saving,
												onClick: () => setRoute(true, {
													provider: "",
													model: "",
													effort: ""
												}),
												children: t("settings.resetRoute")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												className: "sl-inlineHint",
												children: t("settings.resetRouteHint")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewerRoute, {
												id: "sl-strict",
												value: strictRoute,
												inherited: baseRoute,
												catalog,
												disabled: saving,
												t,
												onChange: (route) => setRoute(true, route)
											})
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: "sl-advanced",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [t("settings.advanced"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(invalidKeys.length ? "settings.invalidValues" : "settings.budget") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "sl-budgetGrid",
									children: [budget("Daily"), budget("Strict")]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "sl-scopeNote",
								children: t("settings.globalHint")
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						id: "sl-panel-history",
						role: "tabpanel",
						"aria-labelledby": "sl-tab-history",
						hidden: tab !== "history",
						children: [dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "sl-inlineHint",
							children: t("settings.unsavedTab")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AuditPanel, {
							t,
							audit: props.audit,
							clearAudit: props.clearAudit,
							enabled: tab === "history"
						})]
					})] })
				]
			});
		}
		function emptyDrafts() {
			return {
				reviewerModelProvider: "",
				reviewerModel: "",
				reviewerReasoningEffort: "",
				strictReviewerModelProvider: "",
				strictReviewerModel: "",
				strictReviewerReasoningEffort: "",
				evidenceRoundsDaily: "",
				totalTimeoutMsDaily: "",
				maxEvidenceItemsDaily: "",
				evidenceRoundsStrict: "",
				totalTimeoutMsStrict: "",
				maxEvidenceItemsStrict: ""
			};
		}
		// src/client/SessionPicker.tsx
		/** Adapted from DeepSeek Harness ui-permission-presets/src/client/
		* PermissionSelect.tsx, presentation.ts and PermissionSelect.module.css
		* (MIT, Copyright (c) 2026 DeepSeek).
		* Native Menu, permission artwork and risk dialog are preserved.
		*/
		const DAILY = "second-look-daily";
		const STRICT = "second-look-strict";
		const FULL = "danger-full-access";
		const AUTO = "auto";
		const icons = {
			"read-only": /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconReadOnlyRegular, {}),
			"workspace-write": /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconWorkspaceWriteRegular, {}),
			[FULL]: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconFullAccessRegular, {}),
			[AUTO]: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.PermissionIconAutoReviewRegular, {}),
			[DAILY]: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewIcon, {}),
			[STRICT]: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewIcon, { enhanced: true })
		};
		/** Original glyphs use the host permission family's 16px currentColor outline. */
		function ReviewIcon({ enhanced = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 1.75 13 3.6v4.1c0 3-2 5.15-5 6.55-3-1.4-5-3.55-5-6.55V3.6L8 1.75Z",
					stroke: "currentColor",
					strokeWidth: "1.25",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: enhanced ? "m4.7 8 1.45 1.45L9.4 6.2m-.9 3.25 2.8-2.8" : "m5.5 8 1.65 1.65 3.4-3.4",
					stroke: "currentColor",
					strokeWidth: "1.25",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})]
			});
		}
		const STYLES = `
.sl-permission{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:220px;height:28px;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm);outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500;cursor:pointer}
.sl-permission:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sl-permission:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.sl-permission:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.sl-permission-icon,.sl-permission-chevron{display:inline-flex;flex:0 0 auto}
.sl-permission-icon svg{width:14px;height:14px}
.sl-permission-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sl-permission-option{display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%}
.sl-permission-badge{flex:none;color:var(--dsw-alias-label-tertiary);font-size:8px;line-height:10px;font-weight:500;letter-spacing:.2px}
.sl-permission-chevron{color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.sl-permission-open{transform:rotate(180deg)}
.sl-permission-error{font-size:12px;color:var(--dsw-alias-state-error-primary)}
@container(max-width:460px){.sl-permission:has(.sl-permission-icon) .sl-permission-label{display:none}}
`;
		function SessionPicker({ locked, sessionKey, catalogStore, retryCatalog, select, useProjection, t }) {
			const selection = useProjection("permissions");
			const state = (0, react.useSyncExternalStore)(catalogStore.subscribe, catalogStore.getSnapshot, catalogStore.getSnapshot);
			const [pick, setPick] = (0, react.useState)(null);
			const [open, setOpen] = (0, react.useState)(false);
			const [confirmation, setConfirmation] = (0, react.useState)(null);
			const [acknowledged, setAcknowledged] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			const request = (0, react.useRef)(0);
			const currentValue = selection?.currentValue;
			const catalog = state.value;
			(0, react.useEffect)(() => {
				++request.current;
				setPick(null);
				setFailed(false);
				return () => {
					++request.current;
				};
			}, [sessionKey, state.connected]);
			(0, react.useEffect)(() => {
				setOpen(false);
				setConfirmation(null);
				setAcknowledged(false);
			}, [
				sessionKey,
				locked,
				state.revision,
				currentValue
			]);
			if (selection === void 0) return null;
			const label = (value, name = value) => {
				if (value === DAILY) return t("review.daily");
				if (value === STRICT) return t("review.strict");
				if (value === AUTO) return t("auto.label");
				const entry = {
					"read-only": ["preset.readOnly", "Read Only"],
					"workspace-write": ["preset.workspaceWrite", "Workspace Write"],
					[FULL]: ["preset.fullAccess", "Full access"]
				}[value];
				if (entry !== void 0 && (name === value || name === entry[1])) return t(entry[0]);
				return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) ? name.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : name;
			};
			const visibleOptions = catalog?.options ?? [];
			const displayedValue = pick !== null && visibleOptions.some((option) => option.value === pick) ? pick : selection.currentValue;
			const current = catalog?.options.find((option) => option.value === displayedValue);
			const currentLabel = label(displayedValue, current?.name);
			const submit = (id) => {
				const token = ++request.current;
				setPick(id);
				setFailed(false);
				Promise.resolve().then(() => select(id)).catch(() => false).then((ok) => {
					if (request.current !== token) return;
					setPick(null);
					setFailed(!ok);
				});
			};
			const choose = (id) => {
				setOpen(false);
				if (locked || pick !== null || !visibleOptions.some((option) => option.value === id) || id === selection.currentValue) return;
				if (id === FULL || id === AUTO) {
					setAcknowledged(false);
					setConfirmation(id);
				} else submit(id);
			};
			const closeConfirmation = () => {
				setAcknowledged(false);
				setConfirmation(null);
			};
			const auto = confirmation === AUTO;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: STYLES }),
				catalog === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "sl-permission",
					disabled: !state.connected || !state.error,
					onClick: retryCatalog,
					children: t(!state.connected ? "review.offline" : state.error ? "review.retry" : "review.loading")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open,
					items: visibleOptions.map((option) => ({
						id: option.value,
						label: option.value === AUTO ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "sl-permission-option",
							"aria-label": `${label(option.value, option.name)} ${t("auto.badge")}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label(option.value, option.name) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sl-permission-badge",
								children: t("auto.badge")
							})]
						}) : label(option.value, option.name),
						...icons[option.value] === void 0 ? {} : { icon: icons[option.value] }
					})),
					selectedId: displayedValue,
					onSelect: choose,
					onClose: () => {
						setOpen(false);
					},
					side: "top",
					portal: true,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "sl-permission",
						"aria-label": t("mode", { name: currentLabel }),
						title: displayedValue === AUTO ? t("auto.description") : current?.description,
						disabled: locked || pick !== null || confirmation !== null,
						onClick: () => {
							setOpen((value) => !value);
						},
						children: [
							icons[displayedValue] === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sl-permission-icon",
								"aria-hidden": true,
								children: icons[displayedValue]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sl-permission-label",
								children: currentLabel
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `sl-permission-chevron${open ? " sl-permission-open" : ""}`,
								"aria-hidden": true,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
							})
						]
					})
				}),
				failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					role: "status",
					className: "sl-permission-error",
					children: t("review.failed")
				}) : null,
				confirmation !== null && catalog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
					open: true,
					title: t(auto ? "auto.confirm.title" : "confirm.title"),
					description: t(auto ? "auto.confirm.description" : "confirm.description"),
					acknowledgeLabel: t(auto ? "auto.confirm.acknowledge" : "confirm.acknowledge"),
					cancelLabel: t("confirm.cancel"),
					closeLabel: t("close"),
					confirmLabel: t(auto ? "auto.confirm.enable" : "confirm.enable"),
					acknowledged,
					disabled: locked,
					onAcknowledgedChange: setAcknowledged,
					onCancel: closeConfirmation,
					onConfirm: () => {
						if (locked || !acknowledged || !visibleOptions.some((option) => option.value === confirmation)) return;
						closeConfirmation();
						submit(confirmation);
					}
				}) : null
			] });
		}
		// src/client/locale-sync.ts
		/** Publish the resolved UI language at startup, switches and host reconnects.
		* Serialize requests so an older language cannot arrive after a newer one. */
		function syncHostLanguage(read, subscribeLocale, generation, send) {
			let disposed = false;
			let revision = 0;
			let sending = false;
			let timer;
			const controller = new AbortController();
			const flush = async () => {
				if (disposed || sending || generation.getSnapshot() === void 0) return;
				sending = true;
				const attempt = revision;
				let ok = false;
				try {
					ok = await send(/^zh(?:-|$)/i.test(read()) ? "zh" : "en", controller.signal);
				} catch {}
				sending = false;
				if (disposed) return;
				if (attempt !== revision) {
					flush();
					return;
				}
				if (!ok) timer = setTimeout(() => {
					timer = void 0;
					flush();
				}, 3e3);
			};
			const changed = () => {
				revision++;
				if (timer) clearTimeout(timer);
				timer = void 0;
				flush();
			};
			const stopLocale = subscribeLocale(changed);
			const stopConnection = generation.subscribe(changed);
			changed();
			return () => {
				disposed = true;
				controller.abort();
				stopLocale();
				stopConnection();
				if (timer) clearTimeout(timer);
			};
		}
		// src/client/session-catalog.ts
		function snapshotStore(initial) {
			let value = initial;
			const listeners = /* @__PURE__ */ new Set();
			return {
				getSnapshot: () => value,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set: (next) => {
					value = next;
					for (const listener of [...listeners]) listener();
				}
			};
		}
		var SessionCatalog = class {
			host;
			store = snapshotStore({
				value: null,
				connected: false,
				error: false,
				revision: 0
			});
			stopCatalog;
			stopGeneration;
			generationId;
			epoch = 0;
			disposed = false;
			constructor(host) {
				this.host = host;
				this.stopCatalog = host.remote.$on("permission-presets/catalog-changed", () => this.refresh());
				this.stopGeneration = host.connection.generation.subscribe(() => this.syncGeneration());
				this.syncGeneration();
			}
			syncGeneration() {
				if (this.disposed) return;
				const id = this.host.connection.generation.getSnapshot()?.id;
				if (id === this.generationId && this.epoch > 0) return;
				this.generationId = id;
				++this.epoch;
				this.publish(null, false);
				if (id !== void 0) this.refresh();
			}
			publish(value, error) {
				this.store.set({
					value,
					error,
					connected: this.generationId !== void 0,
					revision: this.store.getSnapshot().revision + 1
				});
			}
			/** Withdraw stale rows immediately; only the newest same-generation read may settle. */
			refresh = () => {
				if (this.disposed) return;
				const id = this.host.connection.generation.getSnapshot()?.id;
				if (id !== this.generationId) {
					this.syncGeneration();
					return;
				}
				if (id === void 0) return;
				const epoch = ++this.epoch;
				this.publish(null, false);
				Promise.resolve().then(() => this.host.remote.permissionPresets.catalog()).then((result) => {
					if (!this.accepts(epoch, id)) return;
					this.publish(result.ok ? result.value : null, !result.ok);
				}).catch(() => {
					if (this.accepts(epoch, id)) this.publish(null, true);
				});
			};
			accepts(epoch, id) {
				return !this.disposed && epoch === this.epoch && id === this.host.connection.generation.getSnapshot()?.id;
			}
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				++this.epoch;
				this.stopCatalog();
				this.stopGeneration();
			}
		};
		// src/client/session-locales.ts
		/** Adapted from DeepSeek Harness ui-permission-presets/src/client/locales.ts
		* (MIT, Copyright (c) 2026 DeepSeek). */
		/** Simplified Chinese dictionary for the current-session popup gate. */
		const accessZh = {
			"review.daily": "日常审查",
			"review.strict": "加强审查",
			"review.loading": "加载权限…",
			"review.offline": "权限连接已断开",
			"review.retry": "重试加载权限",
			"review.failed": "切换失败，请重试",
			"mode": "访问模式，当前：{name}",
			"close": "关闭",
			"preset.readOnly": "仅可查看",
			"preset.workspaceWrite": "工作区内修改",
			"preset.fullAccess": "完全权限",
			"confirm.title": "确认启用完全权限？",
			"confirm.description": "启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。",
			"confirm.acknowledge": "我已了解风险，并愿意继续",
			"confirm.cancel": "取消",
			"confirm.enable": "启用完全权限",
			"auto.label": "自动审查",
			"auto.badge": "EXP",
			"auto.description": "无沙箱运行；每次原生工具调用和 PTC 内层调用前由同一模型进行实验性审查。",
			"auto.confirm.title": "确认启用自动审查（实验）？",
			"auto.confirm.description": "自动审查不使用沙箱。每次原生工具调用和 PTC 内层调用前，都会由与当前 agent 相同的模型进行审查；审查拒绝的调用由你批准或拒绝。此功能仍属实验性，可能误放行或误拒绝，并会消耗额外 token。",
			"auto.confirm.acknowledge": "我已了解这些风险，并愿意继续",
			"auto.confirm.enable": "启用自动审查"
		};
		/** English dictionary for the current-session popup gate. */
		const accessEn = {
			"review.daily": "Routine review",
			"review.strict": "Enhanced review",
			"review.loading": "Loading permissions…",
			"review.offline": "Permissions disconnected",
			"review.retry": "Retry loading permissions",
			"review.failed": "Switch failed; try again",
			"mode": "Access mode, current: {name}",
			"close": "Close",
			"preset.readOnly": "Read Only",
			"preset.workspaceWrite": "Workspace Write",
			"preset.fullAccess": "Full access",
			"confirm.title": "Enable Full access?",
			"confirm.description": "Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.",
			"confirm.acknowledge": "I understand the risks and want to continue",
			"confirm.cancel": "Cancel",
			"confirm.enable": "Enable Full access",
			"auto.label": "Auto review",
			"auto.badge": "EXP",
			"auto.description": "Run without a sandbox after an experimental same-model review of every native tool call and PTC inner call.",
			"auto.confirm.title": "Enable Auto review (experimental)?",
			"auto.confirm.description": "Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it; you approve or reject each call it denies. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.",
			"auto.confirm.acknowledge": "I understand these risks and want to continue",
			"auto.confirm.enable": "Enable Auto review"
		};
		// src/client/settings-ux-locales.ts
		/** Settings UX copy; the same keys are checked in both shipped languages. */
		const uxZh = {
			"settings.tabSettings": "审核设置",
			"settings.tabHistory": "审批记录",
			"settings.configured": "已配置",
			"settings.notConfigured": "待配置",
			"settings.statusUnavailable": "状态暂不可用",
			"settings.modelSetup": "独立审批模型",
			"settings.modelSetupHint": "选择负责审核的模型，与工作模型独立。",
			"settings.globalHint": "模型设置用于所有审查会话；日常 / 加强档位在各会话选择。",
			"settings.enhancedModel": "加强档模型",
			"settings.reusesBase": "复用基础模型与思考强度",
			"settings.customRoute": "使用独立配置",
			"settings.configureSeparately": "单独配置",
			"settings.editRoute": "编辑配置",
			"settings.hideRoute": "收起",
			"settings.resetRoute": "清空独立配置",
			"settings.resetRouteHint": "留空后恢复插件配置默认；未设默认时复用基础设置。保存前可用顶部“取消修改”撤回。",
			"settings.advanced": "高级选项",
			"settings.discard": "取消修改",
			"settings.manualEntry": "手动填写",
			"settings.pickFromList": "从目录选择",
			"settings.providerSelect": "服务商",
			"settings.modelSelect": "模型",
			"settings.reasoningSelect": "思考强度",
			"settings.explicitEffort": "独立设置",
			"settings.chooseProvider": "选择服务商",
			"settings.chooseModel": "选择模型",
			"settings.providerDefault": "配置默认",
			"settings.effortDefault": "配置 / 服务商默认",
			"settings.inheritBase": "复用基础设置",
			"settings.currentCustom": "当前自定义值",
			"settings.catalogLoading": "正在读取可用模型…",
			"settings.catalogFailed": "模型目录暂不可用，可重试或手动填写。现有配置已保留。",
			"settings.catalogPartial": "部分服务商的模型目录未能加载。",
			"settings.catalogRefresh": "刷新模型目录",
			"settings.reasoningManual": "该模型未提供可选思考档位，可留空使用默认或手动填写。",
			"settings.unsavedTab": "切换页面不会丢失未保存的修改。",
			"settings.effortCleared": "模型已切换，思考强度恢复默认；可重新选择。",
			"settings.effort.low": "低",
			"settings.effort.medium": "中",
			"settings.effort.high": "高",
			"settings.effort.max": "最高",
			"settings.effort.minimal": "最低",
			"settings.effort.none": "关闭",
			"settings.effort.off": "关闭",
			"settings.effort.xhigh": "极高",
			"settings.dailyLabel": "日常审查",
			"settings.strictLabel": "加强审查"
		};
		const uxEn = {
			"settings.tabSettings": "Review settings",
			"settings.tabHistory": "Approval history",
			"settings.configured": "Configured",
			"settings.notConfigured": "Setup needed",
			"settings.statusUnavailable": "Status unavailable",
			"settings.modelSetup": "Independent reviewer",
			"settings.modelSetupHint": "Choose the model that reviews actions, independently of your working model.",
			"settings.globalHint": "Reviewer settings apply to all review sessions. Choose Routine or Enhanced in each conversation.",
			"settings.enhancedModel": "Enhanced reviewer",
			"settings.reusesBase": "Uses the base model and reasoning effort",
			"settings.customRoute": "Uses separate settings",
			"settings.configureSeparately": "Configure separately",
			"settings.editRoute": "Edit settings",
			"settings.hideRoute": "Collapse",
			"settings.resetRoute": "Clear separate settings",
			"settings.resetRouteHint": "Empty fields restore configured defaults, or use base settings if none. Discard changes at the top to undo before saving.",
			"settings.advanced": "Advanced options",
			"settings.discard": "Discard changes",
			"settings.manualEntry": "Enter manually",
			"settings.pickFromList": "Choose from catalog",
			"settings.providerSelect": "Provider",
			"settings.modelSelect": "Model",
			"settings.reasoningSelect": "Reasoning effort",
			"settings.explicitEffort": "Separate setting",
			"settings.chooseProvider": "Choose a provider",
			"settings.chooseModel": "Choose a model",
			"settings.providerDefault": "Configured default",
			"settings.effortDefault": "Configured / provider default",
			"settings.inheritBase": "Use base setting",
			"settings.currentCustom": "Current custom value",
			"settings.catalogLoading": "Loading available models…",
			"settings.catalogFailed": "Model catalog unavailable. Retry or enter values manually; your saved settings are preserved.",
			"settings.catalogPartial": "Some provider catalogs could not be loaded.",
			"settings.catalogRefresh": "Refresh models",
			"settings.reasoningManual": "This model advertises no reasoning levels. Use the default or enter a supported value manually.",
			"settings.unsavedTab": "Switching tabs keeps your unsaved changes.",
			"settings.effortCleared": "Model changed. Reasoning effort reset to default; you can choose it again.",
			"settings.effort.low": "Low",
			"settings.effort.medium": "Medium",
			"settings.effort.high": "High",
			"settings.effort.max": "Maximum",
			"settings.effort.minimal": "Minimal",
			"settings.effort.none": "Off",
			"settings.effort.off": "Off",
			"settings.effort.xhigh": "Extra high",
			"settings.dailyLabel": "Routine review",
			"settings.strictLabel": "Enhanced review"
		};
		// src/client/audit-locales.ts
		const auditZh = {
			"audit.search": "搜索工具、理由或会话",
			"audit.searchLabel": "搜索审批记录",
			"audit.searchEmpty": "没有匹配的记录，试试其他关键词或筛选条件。",
			"audit.locale": "zh-CN",
			"audit.historyScope": "记录范围",
			"audit.recent": "最近记录",
			"audit.blocked": "拒绝与拦截",
			"audit.blockedRetention": "单独保存最近 100 条拒绝与拦截事件，重启后保留；普通放行不会占用名额。",
			"audit.persistenceFailed": "拒绝拦截历史读取或保存失败，重启后可能无法保留；当前审核仍正常执行。",
			"audit.guardBlocked": "执行拦截",
			"audit.outboundBlocked": "出站拦截",
			"audit.ruleDeny": "规则拒绝",
			"audit.ruleAsk": "规则转人工",
			"audit.settings": "设置变更",
			"audit.filterAllow": "已放行",
			"audit.filterDeny": "已拒绝",
			"audit.title": "审批记录",
			"audit.description": "放行、拦截与转人工的原因。",
			"audit.retention": "保留本次运行最近 500 条事件；重启后清空。同一调用的审批过程合并展示。",
			"audit.refresh": "刷新",
			"audit.export": "导出日志",
			"audit.clear": "清空记录",
			"audit.confirm": "确认清空",
			"audit.cancel": "取消",
			"audit.confirmText": "清空当前分类中的记录？不会改变审核设置或已有授权。",
			"audit.loading": "正在读取审批记录…",
			"audit.empty": "暂无审批记录",
			"audit.noMatch": "没有符合筛选条件的记录",
			"audit.loadFailed": "记录读取失败，请刷新重试。",
			"audit.clearFailed": "清空失败，记录已保留。",
			"audit.exportFailed": "导出失败，请重试。",
			"audit.all": "全部",
			"audit.exempt": "规则直通",
			"audit.allow": "模型允许",
			"audit.ask": "转人工",
			"audit.deny": "模型拒绝",
			"audit.failure": "审核异常",
			"audit.other": "其他",
			"audit.humanAllow": "用户允许",
			"audit.humanDeny": "用户拒绝",
			"audit.cancelled": "已取消",
			"audit.unavailable": "未获批准",
			"audit.more": "查看更多",
			"audit.less": "收起",
			"audit.filter": "筛选审批结果",
			"audit.model": "审核模型",
			"audit.destinationModel": "发送目标模型",
			"audit.duration": "审核耗时",
			"audit.tier": "档位",
			"audit.daily": "日常",
			"audit.strict": "加强",
			"audit.session": "会话",
			"audit.call": "调用",
			"audit.unknown": "未提供",
			"audit.events": "事件",
			"audit.calls": "次调用",
			"audit.cleared": "记录已清空。",
			"audit.failed": "审核失败",
			"audit.seconds": "秒"
		};
		const auditEn = {
			"audit.search": "Search tools, reasons or sessions",
			"audit.searchLabel": "Search approval history",
			"audit.searchEmpty": "No matching records. Try another search or filter.",
			"audit.locale": "en",
			"audit.historyScope": "History scope",
			"audit.recent": "Recent activity",
			"audit.blocked": "Denials and blocks",
			"audit.blockedRetention": "Separately saves the latest 100 denied or blocked events across restarts; approvals do not use these slots.",
			"audit.persistenceFailed": "Blocked history could not be loaded or saved and may not survive restart. Reviews are still enforced.",
			"audit.guardBlocked": "Execution blocked",
			"audit.outboundBlocked": "Outbound blocked",
			"audit.ruleDeny": "Rule denied",
			"audit.ruleAsk": "Human review required by rule",
			"audit.settings": "Settings changed",
			"audit.filterAllow": "Allowed",
			"audit.filterDeny": "Denied",
			"audit.title": "Approval history",
			"audit.description": "Reasons for approvals, blocks and human decisions.",
			"audit.retention": "Keeps the latest 500 events in this run; cleared on restart. Decisions for the same call are grouped.",
			"audit.refresh": "Refresh",
			"audit.export": "Export logs",
			"audit.clear": "Clear history",
			"audit.confirm": "Confirm clear",
			"audit.cancel": "Cancel",
			"audit.confirmText": "Clear the selected history? Settings and existing authorizations stay unchanged.",
			"audit.loading": "Loading approval history…",
			"audit.empty": "No approval history yet",
			"audit.noMatch": "No matching records",
			"audit.loadFailed": "Could not load history. Refresh to retry.",
			"audit.clearFailed": "Could not clear history. Records were retained.",
			"audit.exportFailed": "Could not export. Please retry.",
			"audit.all": "All",
			"audit.exempt": "Rule bypass",
			"audit.allow": "Model allowed",
			"audit.ask": "Human decision needed",
			"audit.deny": "Model denied",
			"audit.failure": "Review issue",
			"audit.other": "Other",
			"audit.humanAllow": "User allowed",
			"audit.humanDeny": "User denied",
			"audit.cancelled": "Cancelled",
			"audit.unavailable": "Not approved",
			"audit.more": "Show more",
			"audit.less": "Collapse",
			"audit.filter": "Filter approval results",
			"audit.model": "Reviewer",
			"audit.destinationModel": "Destination model",
			"audit.duration": "Review duration",
			"audit.tier": "Tier",
			"audit.daily": "Daily",
			"audit.strict": "Strict",
			"audit.session": "Session",
			"audit.call": "Call",
			"audit.unknown": "Unavailable",
			"audit.events": "events",
			"audit.calls": "calls",
			"audit.cleared": "History cleared.",
			"audit.failed": "Review failed",
			"audit.seconds": "s"
		};
		// src/client/settings-locales.ts
		const supplementalZh = {
			"settings.errorStorage": "设置未能写入磁盘，请检查数据目录权限或可用空间后重试。",
			"settings.errorCredential": "这里只能填写服务商和模型名称，请勿填写密钥。",
			"settings.errorInput": "设置内容无效，请检查填写内容后重试。",
			"settings.errorNetwork": "暂时无法保存设置，请检查客户端连接后重试。",
			"settings.reasoning.placeholder": "如 high、low",
			"settings.reasoning.desc": "使用模型支持的思考等级；留空采用默认。",
			"settings.inheritReasoning": "留空复用基础思考强度",
			"settings.budget.desc": "限制补证范围与等待时间，不是模型的思考 token 上限。",
			"settings.invalidNumber": "请输入有效的正整数",
			"settings.resetHint": "清空此项，回落到配置默认值",
			"settings.invalidValues": "请修正无效数值",
			"settings.unsaved": "有未保存更改",
			"settings.loadFailed": "设置加载失败",
			"settings.loading": "正在加载设置…",
			"settings.retry": "重试",
			"settings.health": "插件状态",
			"settings.healthy": "运行正常",
			"settings.unhealthy": "需要处理",
			"settings.reviewPresets": "权限档位",
			"settings.route.desc": "独立审核使用的模型与思考强度。",
			"settings.reasoning": "审核思考强度",
			"settings.strictTier.desc": "留空时复用基础审核路由。",
			"settings.inheritProvider": "留空复用基础服务商",
			"settings.inheritModel": "留空复用基础模型",
			"settings.strictReasoning": "加强档思考强度",
			"settings.budget": "补证范围与超时"
		};
		const supplementalEn = {
			"settings.errorStorage": "Settings could not be written to disk. Check directory permissions or available space and retry.",
			"settings.errorCredential": "Enter provider and model names only, never API keys.",
			"settings.errorInput": "Invalid settings. Check the entered values and retry.",
			"settings.errorNetwork": "Settings could not be saved. Check the client connection and retry.",
			"settings.reasoning.placeholder": "e.g. high, low",
			"settings.reasoning.desc": "Use a reasoning level supported by the model; leave empty for its default.",
			"settings.inheritReasoning": "Use base reasoning effort when empty",
			"settings.budget.desc": "Limits evidence scope and waiting time, not reasoning tokens.",
			"settings.invalidNumber": "Enter a valid positive integer",
			"settings.resetHint": "Clear to use the configured default",
			"settings.invalidValues": "Fix invalid values",
			"settings.unsaved": "Unsaved changes",
			"settings.loadFailed": "Failed to load settings",
			"settings.loading": "Loading settings…",
			"settings.retry": "Retry",
			"settings.health": "Plugin status",
			"settings.healthy": "Healthy",
			"settings.unhealthy": "Needs attention",
			"settings.reviewPresets": "Permission presets",
			"settings.route.desc": "Independent reviewer model and reasoning effort.",
			"settings.reasoning": "Review reasoning effort",
			"settings.strictTier.desc": "Leave empty to reuse the base reviewer route.",
			"settings.inheritProvider": "Use base provider when empty",
			"settings.inheritModel": "Use base model when empty",
			"settings.strictReasoning": "Enhanced reasoning effort",
			"settings.budget": "Evidence scope and timeouts"
		};
		const zh = {
			...auditZh,
			...supplementalZh,
			...uxZh,
			"settings.label": "过目",
			"settings.title": "过目",
			"settings.blurb": "在当前会话的权限菜单选择日常审查或加强审查。这里只配置审核路由与预算；凭据由宿主管理。",
			"settings.route": "审核路由",
			"settings.provider": "审核服务商",
			"settings.provider.desc": "独立审核使用的 LLM 服务商名（必填）。",
			"settings.model": "审核模型",
			"settings.model.desc": "独立审核使用的模型名（必填）。",
			"settings.effort": "审核思考强度",
			"settings.effort.desc": "由模型支持的思考等级控制；插件不另设思考 token 上限。留空用默认。",
			"settings.effort.placeholder": "如 high、low",
			"settings.strict": "加强档覆盖",
			"settings.strictProvider": "加强档服务商",
			"settings.strictProvider.desc": "留空则用上面的服务商。",
			"settings.strictModel": "加强档模型",
			"settings.strictModel.desc": "留空则用上面的模型。",
			"settings.strictEffort": "加强档思考强度",
			"settings.strictEffort.desc": "留空则用上面的强度。",
			"settings.strict.desc": "留空＝加强档复用上面的基础审核路由。",
			"settings.daily": "日常档补证与超时",
			"settings.strictTier": "加强档补证与超时",
			"settings.evidenceRounds": "补证轮数",
			"settings.evidenceRounds.desc": "一次审核允许的补证轮数；0 表示关闭补证。",
			"settings.totalTimeoutMs": "总超时",
			"settings.totalTimeoutMs.desc": "一次审核（含补证）的总时限。",
			"settings.maxEvidenceItems": "单轮补证条目上限",
			"settings.maxEvidenceItems.desc": "一轮补证请求最多带回的探查条目数。",
			"settings.unit.rounds": "轮",
			"settings.unit.ms": "毫秒",
			"settings.unit.items": "条",
			"settings.overridden": "已覆盖",
			"settings.reset": "重置",
			"settings.invalid": "请填数字；留空表示清除该覆盖。",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.saved": "已保存",
			"settings.saveFailed": "保存失败",
			"settings.persistence": "持久化位置",
			"settings.status": "状态",
			"settings.status.ok": "正常",
			"settings.status.broken": "失效（fail-closed）",
			"settings.status.reviewer": "实际 reviewer",
			"settings.status.presets": "权限预设名册"
		};
		const en = {
			...auditEn,
			...supplementalEn,
			...uxEn,
			"settings.label": "Second Look",
			"settings.title": "Second Look",
			"settings.blurb": "Choose Routine review or Enhanced review from the current session’s permission menu. Configure reviewer routes and budgets here; credentials stay in the host.",
			"settings.route": "Reviewer route",
			"settings.provider": "Reviewer provider",
			"settings.provider.desc": "LLM provider name for independent reviews (required).",
			"settings.model": "Reviewer model",
			"settings.model.desc": "Model name for independent reviews (required).",
			"settings.effort": "Reviewer reasoning effort",
			"settings.effort.desc": "Use a supported reasoning level. No additional thinking-token cap is set by this plugin. Empty keeps the default.",
			"settings.effort.placeholder": "e.g. high, low",
			"settings.strict": "Strict-tier override",
			"settings.strictProvider": "Strict provider",
			"settings.strictProvider.desc": "Empty reuses the provider above.",
			"settings.strictModel": "Strict model",
			"settings.strictModel.desc": "Empty reuses the model above.",
			"settings.strictEffort": "Strict reasoning effort",
			"settings.strictEffort.desc": "Empty reuses the effort above.",
			"settings.strict.desc": "Leave empty to reuse the base reviewer route for the strict tier.",
			"settings.daily": "Daily evidence and timeout",
			"settings.strictTier": "Strict evidence and timeout",
			"settings.evidenceRounds": "Evidence rounds",
			"settings.evidenceRounds.desc": "Evidence rounds one review may spend; 0 disables them.",
			"settings.totalTimeoutMs": "Total timeout",
			"settings.totalTimeoutMs.desc": "Total deadline for one review, evidence rounds included.",
			"settings.maxEvidenceItems": "Max evidence items per round",
			"settings.maxEvidenceItems.desc": "Probe items one evidence round may bring back.",
			"settings.unit.rounds": "rounds",
			"settings.unit.ms": "ms",
			"settings.unit.items": "items",
			"settings.overridden": "Overridden",
			"settings.reset": "Reset",
			"settings.invalid": "Enter a number; leave empty to clear this override.",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.saved": "Saved",
			"settings.saveFailed": "Save failed",
			"settings.persistence": "Persisted at",
			"settings.status": "Status",
			"settings.status.ok": "healthy",
			"settings.status.broken": "broken (fail-closed)",
			"settings.status.reviewer": "Effective reviewer",
			"settings.status.presets": "Permission presets"
		};
		// src/client/settings-api.ts
		async function readJson(response) {
			try {
				return await response.json();
			} catch {
				return {
					ok: false,
					error: `HTTP ${response.status}`
				};
			}
		}
		async function fetchStatus() {
			try {
				const response = await fetch("/second-look/status", { cache: "no-store" });
				if (!response.ok) return {
					ok: false,
					error: `HTTP ${response.status}`
				};
				return await readJson(response);
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : "status fetch failed"
				};
			}
		}
		async function fetchConfig() {
			try {
				const response = await fetch("/second-look/config", { cache: "no-store" });
				if (!response.ok) return {
					ok: false,
					error: `HTTP ${response.status}`
				};
				return await readJson(response);
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : "config fetch failed"
				};
			}
		}
		async function saveConfig(patch) {
			try {
				const response = await fetch("/second-look/config", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(patch)
				});
				if (!response.ok) {
					const body = await readJson(response);
					return {
						ok: false,
						error: body.error ?? `HTTP ${response.status}`,
						...body.message === void 0 ? {} : { message: body.message }
					};
				}
				return await readJson(response);
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : "config save failed"
				};
			}
		}
		async function fetchAudit() {
			try {
				const response = await fetch("/second-look/audit?limit=500", { cache: "no-store" });
				if (!response.ok) return {
					ok: false,
					error: `HTTP ${response.status}`
				};
				return await readJson(response);
			} catch {
				return {
					ok: false,
					error: "network-error"
				};
			}
		}
		async function clearAudit(scope = "recent") {
			try {
				const response = await fetch("/second-look/audit/clear", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						confirm: true,
						scope
					})
				});
				if (!response.ok) return {
					ok: false,
					error: `HTTP ${response.status}`
				};
				return await readJson(response);
			} catch {
				return {
					ok: false,
					error: "network-error"
				};
			}
		}
		// src/client/index.ts
		/** Browser services required by the settings section. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"sessions",
			"remote",
			"remote.permissionPresets"
		];
		/** Register the locale dictionaries through the structural locale surface. */
		function registerLocale(ctx, namespace, dictionaries, label) {
			const locale = ctx.locale;
			ctx.effect(() => {
				try {
					return locale.register(namespace, dictionaries);
				} catch {
					return () => void 0;
				}
			}, label);
		}
		function apply(ctx) {
			registerSettingsNavIcon(ctx);
			registerLocale(ctx, "second-look", {
				zh,
				en
			}, "second-look: settings dictionaries");
			registerLocale(ctx, "second-look.permission", {
				zh: accessZh,
				en: accessEn
			}, "second-look: session dictionaries");
			const effectCtx = ctx;
			const host = ctx;
			if (typeof ctx.locale.getLocale === "function") effectCtx.effect(() => syncHostLanguage(() => ctx.locale.getLocale().active, (changed) => ctx.on("locale/change", changed), ctx.get("connection").generation, async (language, signal) => (await fetch("/second-look/locale", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ language }),
				signal: AbortSignal.any([signal, AbortSignal.timeout(5e3)])
			})).ok), "second-look: host language");
			const catalog = new SessionCatalog({
				connection: ctx.get("connection"),
				remote: host.remote
			});
			effectCtx.effect(() => () => catalog.dispose(), "second-look: session catalog");
			ctx.slots.inject("conversation.input.permission", () => ctx.slots.register({
				name: "conversation.input.permission",
				priority: -10,
				locale: "second-look.permission",
				inject: (sessionId) => ({
					sessionKey: String(sessionId),
					catalogStore: catalog.store,
					retryCatalog: catalog.refresh,
					select: async (preset) => {
						const session = host.sessions.binding(String(sessionId))?.session;
						if (session === void 0) return false;
						const result = await session.command(`/permission ${preset}`);
						return result.ok && result.value?.matched === true;
					}
				})
			}, SessionPicker));
			let disposeSection = null;
			const mountSection = () => {
				if (disposeSection !== null) {
					disposeSection();
					disposeSection = null;
				}
				try {
					const t = ctx.locale.bind("second-look");
					disposeSection = ctx.slots.register({
						name: "settings.section",
						id: "second-look",
						order: 56,
						label: () => t("settings.label"),
						inject: () => ({
							t,
							config: () => fetchConfig(),
							saveConfig: (patch) => saveConfig(patch),
							status: () => fetchStatus(),
							modelCatalog: () => loadReviewerCatalog(host.remote),
							audit: fetchAudit,
							clearAudit
						})
					}, GateSettings);
				} catch {
					disposeSection = null;
				}
			};
			ctx.slots.inject("settings.section", () => {
				mountSection();
				const onLocale = ctx.on("locale/change", () => {
					mountSection();
				});
				return () => {
					onLocale();
					if (disposeSection !== null) {
						disposeSection();
						disposeSection = null;
					}
				};
			});
		}
		exports.GateSettings = GateSettings;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map