/* Общие условия выборки для реестра, сводки и ссылок ассистента. */
(function () {
  const DA = window.DA = window.DA || {};
  const ENUMS = {
    languages: ["RU", "KZ", "EN"], channels: ["agent chat", "voice call"],
    status: ["new", "done", "running", "failed", "stale"],
    attention: ["gross", "review"], appealStatus: ["none", "open", "resolved"]
  };
  const KEYS = ["q", "groupId", "checklistId", "scoreFrom", "scoreTo", "dateFrom", "dateTo",
    "timezoneOffsetMinutes", ...Object.keys(ENUMS), "conversationIds"];
  const list = (value) => value == null || value === "" ? [] : value instanceof Set ? [...value]
    : Array.isArray(value) ? value.slice() : String(value).split(",").map((part) => part.trim()).filter(Boolean);
  const unique = (values) => [...new Set(values)];
  const bound = (value) => {
    if (value == null || String(value).trim() === "") return null;
    if (typeof value === "boolean") return String(value);
    const text = String(value).trim().replace(",", ".");
    return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : text;
  };
  function normalize(source) {
    const raw = source || {}, out = {
      q: typeof raw.q === "string" ? raw.q : "", groupId: raw.groupId || "", checklistId: raw.checklistId || "",
      scoreFrom: bound(raw.scoreFrom), scoreTo: bound(raw.scoreTo), dateFrom: raw.dateFrom || "", dateTo: raw.dateTo || "",
      timezoneOffsetMinutes: raw.timezoneOffsetMinutes == null || raw.timezoneOffsetMinutes === ""
        ? new Date().getTimezoneOffset() : Number(raw.timezoneOffsetMinutes),
      conversationIds: raw.conversationIds == null ? null : Array.isArray(raw.conversationIds) ? unique(raw.conversationIds) : raw.conversationIds
    };
    for (const key of Object.keys(ENUMS)) out[key] = unique(list(raw[key]));
    out.channels = unique(out.channels.map((value) => ({ calls: "voice call", chats: "agent chat" })[value] || value));
    return out;
  }
  function dateValue(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return null;
    const ms = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
  }
  function validate(source) {
    const value = normalize(source), errors = [];
    const add = (field, code) => errors.push({ field, code });
    for (const key of ["scoreFrom", "scoreTo"]) {
      if (value[key] != null && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 100)) add(key, "score");
    }
    if (!errors.length && value.scoreFrom != null && value.scoreTo != null && value.scoreFrom > value.scoreTo) add("scoreTo", "scoreOrder");
    for (const key of ["dateFrom", "dateTo"]) if (value[key] && dateValue(value[key]) == null) add(key, "date");
    if (dateValue(value.dateFrom) != null && dateValue(value.dateTo) != null && value.dateFrom > value.dateTo) add("dateTo", "dateOrder");
    if (!Number.isInteger(value.timezoneOffsetMinutes) || Math.abs(value.timezoneOffsetMinutes) > 840) add("timezoneOffsetMinutes", "timezone");
    for (const [key, choices] of Object.entries(ENUMS)) if (value[key].some((item) => !choices.includes(item))) add(key, "choice");
    if (value.conversationIds !== null && (!Array.isArray(value.conversationIds)
        || value.conversationIds.some((id) => typeof id !== "string" || !id.length))) add("conversationIds", "selection");
    if (typeof value.groupId !== "string" || typeof value.checklistId !== "string") add("checklistId", "choice");
    return { valid: errors.length === 0, errors };
  }
  function readQuery(query) {
    const raw = query instanceof URLSearchParams ? Object.fromEntries(query) : { ...(query || {}) };
    if (raw.languages == null && raw.lang != null) raw.languages = raw.lang;
    if (raw.channels == null && raw.channel != null) raw.channels = raw.channel === "all" ? [] : raw.channel;
    if (raw.status == null && raw.state != null) {
      const old = list(raw.state);
      raw.status = old.filter((value) => ![...ENUMS.attention, "appeal"].includes(value));
      raw.attention = unique([...list(raw.attention), ...old.filter((value) => ENUMS.attention.includes(value))]);
      if (old.includes("appeal")) raw.appealStatus = ["open", "resolved"];
    }
    if (Object.hasOwn(raw, "conversationIds") && typeof raw.conversationIds === "string") {
      try { const parsed = JSON.parse(raw.conversationIds); if (Array.isArray(parsed)) raw.conversationIds = parsed; }
      catch (_) { /* Неверная выборка останется ошибкой, а не превратится во весь реестр. */ }
    }
    return normalize(raw);
  }
  function toQuery(source) {
    const value = normalize(source), result = {};
    if (!validate(value).valid) throw new TypeError("Invalid conversation filters");
    for (const key of ["q", "groupId", "checklistId", "dateFrom", "dateTo"]) if (value[key]) result[key] = value[key];
    for (const key of ["scoreFrom", "scoreTo"]) if (value[key] != null) result[key] = String(value[key]);
    if (value.dateFrom || value.dateTo) result.timezoneOffsetMinutes = String(value.timezoneOffsetMinutes);
    for (const key of Object.keys(ENUMS)) if (value[key].length) result[key] = value[key].join(",");
    if (value.conversationIds !== null) result.conversationIds = JSON.stringify(value.conversationIds);
    return result;
  }
  function href(filters) {
    const query = new URLSearchParams(toQuery(filters));
    return "#/" + (query.size ? "?" + query : "");
  }
  function hasQuery(query) {
    return [...KEYS, "lang", "channel", "state"].some((key) => Object.hasOwn(query || {}, key));
  }
  function count(source) {
    const value = normalize(source);
    return Object.keys(ENUMS).reduce((sum, key) => sum + value[key].length, 0)
      + ["q", "groupId", "checklistId"].filter((key) => value[key]).length
      + Number(value.scoreFrom != null || value.scoreTo != null) + Number(!!(value.dateFrom || value.dateTo))
      + Number(value.conversationIds !== null);
  }
  DA.registryFilters = { normalize, readQuery, validate, toQuery, href, hasQuery, count, dateValue, keys: KEYS, enums: ENUMS };
})();
