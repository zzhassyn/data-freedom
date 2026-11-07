/* Плеер звонка. Волна строится из записи; при ошибке декодирования остаётся перемотка. */
(function () {
  const DA = window.DA, h = DA.h;
  let sequence = 0;
  const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  const time = (value) => {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };

  DA.audioPlayer = function (options) {
    const opts = options || {}, id = `da-player-${++sequence}`;
    let source = "";
    try {
      const url = new URL(opts.src || `/api/conversations/${encodeURIComponent(opts.conversationId)}/audio`, location.href);
      if (url.origin === location.origin && ["http:", "https:"].includes(url.protocol)) source = url.href;
    } catch (_) { /* Недопустимый адрес не назначается элементу audio. */ }
    const audio = h("audio", { preload: "metadata", hidden: true });
    const playButton = h("button", { class: "da-player-play", type: "button", "aria-label": "Воспроизвести запись" },
      h("span", { class: "da-player-play-icon", "aria-hidden": "true" }, DA.icon("play", 20)),
      h("span", { class: "da-player-pause-icon", "aria-hidden": "true" }, DA.icon("pause", 20)));
    const currentText = h("span", {}, "00:00"), durationText = h("span", {}, "…");
    const times = h("div", { class: "da-player-times", "aria-label": "Время записи" }, currentText, h("span", { "aria-hidden": "true" }, "/"), durationText);
    const speeds = h("div", { class: "da-player-speed", role: "group", "aria-label": "Скорость воспроизведения" },
      [1, 1.25, 1.5, 2].map((value) => h("button", { type: "button", "aria-pressed": String(value === 1), "aria-label": `Скорость ${String(value).replace(".", ",")}×`,
        onclick: () => { audio.playbackRate = value; for (const button of speeds.children) button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === value)); },
        "data-speed": value }, `${String(value).replace(".", ",")}×`)));
    const canvas = h("canvas", { "aria-hidden": "true" });
    const wave = h("div", { class: "da-player-wave", role: "slider", tabindex: 0, "aria-label": "Позиция в записи", "aria-valuemin": "0", "aria-valuemax": "0", "aria-valuenow": "0", "aria-valuetext": "Запись загружается", "aria-describedby": `${id}-hint ${id}-missing` }, canvas);
    const hint = h("span", { class: "da-sr", id: `${id}-hint` }, "Стрелки перематывают запись на пять секунд. Пробел включает и останавливает воспроизведение.");
    const missing = h("p", { class: "da-player-missing", id: `${id}-missing`, hidden: true });
    const issueText = h("span");
    const retry = h("button", { class: "da-btn is-text is-sm", type: "button", onclick: retryAudio }, "Повторить");
    const issue = h("div", { class: "da-player-error", role: "status", hidden: true }, issueText, retry);
    const el = h("section", { class: "da-player", "aria-label": "Запись звонка", "data-waveform": "loading" },
      h("div", { class: "da-player-controls" }, playButton, times, speeds), wave, hint, missing, issue, audio);
    let disposed = false, metadata = {}, markers = [], envelope = null, decodedDuration = 0, displayEnvelope = null;
    let frame = 0, fetchController = null, audioContext = null, pendingSeek = null, loadGeneration = 0;
    let lastPlaying = null, lastSecond = -1;

    const duration = () => positive(metadata.audioSecondsDeclared) || positive(audio.duration) || decodedDuration || positive(metadata.audioSecondsDecoded);
    const available = () => metadata.incomplete && positive(metadata.audioSecondsDecoded)
      ? Math.min(positive(metadata.audioSecondsDecoded), duration() || Infinity)
      : positive(audio.duration) || decodedDuration || positive(metadata.audioSecondsDecoded) || duration();
    const isPlaying = () => !audio.paused && !audio.ended;
    const color = (name) => getComputedStyle(el).getPropertyValue(name).trim();
    function report(message, recoverable) {
      if (disposed) return;
      issueText.textContent = message; issue.hidden = false; retry.hidden = !recoverable;
      opts.onError?.(message);
    }
    function clearIssue() { issue.hidden = true; issueText.textContent = ""; }

    /* Пересчитываем энергию под ширину панели: столбцы остаются читаемыми и на телефоне. */
    function signalForWidth(width) {
      if (!envelope) return null;
      const count = Math.max(1, Math.min(envelope.power.length - 1, Math.floor(width / 4)));
      if (displayEnvelope?.count === count) return displayEnvelope.values;
      const values = [], buckets = envelope.power.length - 1;
      for (let i = 0; i < count; i++) {
        const start = Math.floor(i * buckets / count), end = Math.floor((i + 1) * buckets / count);
        const samples = envelope.samples[end] - envelope.samples[start];
        values.push(samples ? Math.sqrt(Math.max(0, envelope.power[end] - envelope.power[start]) / samples) : 0);
      }
      const nonzero = values.filter((value) => value > 0).sort((a, b) => a - b);
      const reference = Math.max(nonzero[Math.floor((nonzero.length - 1) * .95)] || 0, .0001);
      const normalized = values.map((value) => Math.min(1, Math.pow(value / reference, .85)));
      displayEnvelope = { count, values: normalized };
      return normalized;
    }

    /* Масштаб всей записи сохраняется и для обрезанного файла. Недоступная часть заштрихована. */
    function draw() {
      if (disposed) return;
      const rect = wave.getBoundingClientRect(), width = rect.width, height = rect.height;
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1, pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      const total = duration(), limit = available(), playableWidth = total && metadata.incomplete ? width * Math.min(1, limit / total) : width;
      const played = total ? width * Math.min(1, Math.max(0, audio.currentTime / total)) : 0;
      const brand = color("--da-brand"), rest = color("--da-text-3");
      const signalWidth = Math.min(playableWidth, total && decodedDuration ? width * Math.min(1, decodedDuration / total) : playableWidth);
      const values = signalForWidth(signalWidth), signalHeight = height - 14, center = signalHeight / 2;
      ctx.fillStyle = color("--da-surface-3"); ctx.fillRect(0, Math.round(center), playableWidth, 1);
      const drawSignal = (fill) => {
        ctx.fillStyle = fill;
        if (!values) { ctx.fillRect(0, Math.round(center) - 2, playableWidth, 4); return; }
        const step = signalWidth / values.length, barWidth = Math.min(2.5, step * .55);
        for (let i = 0; i < values.length; i++) {
          if (!values[i]) continue;
          const barHeight = Math.max(1, values[i] * (signalHeight - 8));
          const x = i * step + (step - barWidth) / 2, y = center - barHeight / 2;
          ctx.beginPath(); ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2); ctx.fill();
        }
      };
      drawSignal(rest);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, played, height); ctx.clip(); drawSignal(brand); ctx.restore();
      if (metadata.incomplete && playableWidth < width) {
        ctx.save(); ctx.beginPath(); ctx.rect(playableWidth, 7, width - playableWidth, height - 14); ctx.clip();
        ctx.fillStyle = color("--da-na-soft"); ctx.fillRect(playableWidth, 7, width - playableWidth, height - 14);
        ctx.strokeStyle = color("--da-na"); ctx.lineWidth = 1;
        for (let x = playableWidth - height; x < width + height; x += 8) { ctx.beginPath(); ctx.moveTo(x, height - 7); ctx.lineTo(x + height, 7); ctx.stroke(); }
        ctx.restore();
      }
      if (total) for (const marker of markers) {
        if (marker.time > total || metadata.incomplete && marker.time > limit) continue;
        const x = Math.min(width - 1, width * marker.time / total), evidence = marker.kind === "evidence";
        ctx.strokeStyle = evidence ? color({ yes: "--da-yes-ink", no: "--da-no-ink", partial: "--da-partial-ink", flag: "--da-gross", na: "--da-text-2" }[marker.tone] || "--da-brand") : color("--da-text-3");
        ctx.lineWidth = evidence ? 3 : 1;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x, evidence ? height - 11 : height - 7); ctx.lineTo(x, height - 4); ctx.stroke();
      }
      if (total) {
        const x = Math.max(1, Math.min(width - 1, played));
        ctx.fillStyle = brand; ctx.fillRect(x - .75, 3, 1.5, signalHeight - 4);
        ctx.beginPath(); ctx.arc(x, 3, 2, 0, Math.PI * 2); ctx.fill();
      }
    }

    function render(notify) {
      if (disposed) return;
      const total = duration(), playing = isPlaying(), second = Math.floor(audio.currentTime || 0);
      if (lastSecond !== second) { currentText.textContent = time(second); lastSecond = second; }
      durationText.textContent = total ? time(total) : "…";
      if (playing !== lastPlaying) {
        el.classList.toggle("is-playing", playing);
        playButton.setAttribute("aria-label", playing ? "Поставить запись на паузу" : "Воспроизвести запись");
        lastPlaying = playing;
      }
      wave.setAttribute("aria-valuemax", String(Math.round(total)));
      wave.setAttribute("aria-valuenow", String(second));
      wave.setAttribute("aria-valuetext", total ? `${time(second)} из ${time(total)}` : "Запись загружается");
      wave.setAttribute("aria-disabled", String(!total));
      missing.hidden = !metadata.incomplete;
      if (metadata.incomplete) missing.textContent = `Запись обрывается на ${time(available())} из ${time(total)}`;
      draw();
      if (notify) opts.onTime?.(audio.currentTime || 0, { playing, duration: total });
    }
    function animate() {
      cancelAnimationFrame(frame);
      if (disposed || !isPlaying()) return;
      draw(); frame = requestAnimationFrame(animate);
    }

    async function play() {
      if (disposed || !source) return false;
      clearIssue();
      try { await audio.play(); return !disposed; }
      catch (error) {
        if (disposed || error.name === "AbortError") return false;
        report(error.name === "NotAllowedError" ? "Нажмите кнопку воспроизведения, чтобы начать запись." : "Не удалось воспроизвести запись. Попробуйте ещё раз.", error.name !== "NotAllowedError");
        return false;
      }
    }
    function toggle() { if (isPlaying()) audio.pause(); else play(); }

    function seek(seconds, settings) {
      if (disposed || !Number.isFinite(Number(seconds))) return false;
      const target = Math.max(0, Number(seconds)), limit = available();
      if (metadata.incomplete && limit && target > limit) { DA.toast("Этой части нет в записи", wave); return false; }
      const value = limit ? Math.min(target, limit) : target;
      if (audio.readyState === 0) pendingSeek = value;
      else { try { audio.currentTime = value; pendingSeek = null; } catch (_) { pendingSeek = value; } }
      if (settings?.play) play();
      render(true);
      return true;
    }

    function loaded() {
      if (pendingSeek != null) { const target = pendingSeek; pendingSeek = null; seek(target); }
      render(true);
    }
    function onPlay() { clearIssue(); render(true); animate(); }
    function onPause() { cancelAnimationFrame(frame); render(true); }
    function onTime() { render(true); }
    function onError() { if (!disposed) { report("Не удалось загрузить запись. Попробуйте ещё раз.", true); render(true); } }
    function onWaiting() { el.classList.add("is-buffering"); }
    function onPlaying() { el.classList.remove("is-buffering"); }

    async function buildWave() {
      const generation = ++loadGeneration;
      fetchController?.abort();
      const controller = fetchController = new AbortController();
      envelope = null; displayEnvelope = null; el.dataset.waveform = "loading"; draw();
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!source || !AudioContext) throw new Error("No audio decoder");
        const response = await fetch(source, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error("Audio unavailable");
        const bytes = await response.arrayBuffer();
        if (disposed || generation !== loadGeneration) return;
        const context = audioContext = new AudioContext();
        const buffer = await context.decodeAudioData(bytes);
        if (disposed || generation !== loadGeneration) { await context.close().catch(() => {}); return; }
        decodedDuration = buffer.duration;
        const count = Math.min(4096, buffer.length), power = new Float64Array(count + 1), samples = new Float64Array(count + 1);
        for (let bucket = 0; bucket < count; bucket++) {
          let sum = 0;
          const start = Math.floor(bucket * buffer.length / count), end = Math.floor((bucket + 1) * buffer.length / count);
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = start; i < end; i++) sum += data[i] * data[i];
          }
          power[bucket + 1] = power[bucket] + sum;
          samples[bucket + 1] = samples[bucket] + (end - start) * buffer.numberOfChannels;
        }
        envelope = { power, samples }; displayEnvelope = null;
        el.dataset.waveform = "ready";
        await context.close().catch(() => {});
        if (audioContext === context) audioContext = null;
        render(false);
      } catch (error) {
        if (!disposed && generation === loadGeneration && !controller.signal.aborted) {
          audioContext?.close().catch(() => {}); audioContext = null;
          el.dataset.waveform = "fallback"; draw();
        }
      }
    }
    function retryAudio() {
      if (!source || disposed) return;
      clearIssue(); audio.load();
      if (!envelope) buildWave();
    }
    function pointerSeek(event) {
      const rect = wave.getBoundingClientRect(), total = duration();
      if (!total) return;
      seek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total);
    }
    function waveKey(event) {
      const key = event.key;
      if (!["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Home", "End", " "].includes(key)) return;
      event.preventDefault();
      if (key === " ") { if (!event.repeat) toggle(); return; }
      const target = key === "Home" ? 0 : key === "End" ? available() : audio.currentTime + (["ArrowRight", "ArrowUp"].includes(key) ? 5 : -5);
      seek(target);
    }
    function documentKey(event) {
      if (event.key !== " " || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || !el.isConnected || !el.getClientRects().length) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') || event.target.closest?.('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="checkbox"],[role="tab"],[role="slider"]')) return;
      event.preventDefault(); toggle();
    }
    function hoverMarker(event) {
      const total = duration(), rect = wave.getBoundingClientRect();
      const marker = total && markers.find((item) => Math.abs(item.time / total * rect.width - (event.clientX - rect.left)) <= 5);
      wave.title = marker ? `${marker.kind === "evidence" ? "Цитата критерия" : "Реплика оператора"}, ${time(marker.time)}` : "Нажмите, чтобы перемотать запись";
    }

    playButton.addEventListener("click", toggle);
    wave.addEventListener("click", pointerSeek); wave.addEventListener("keydown", waveKey); wave.addEventListener("pointermove", hoverMarker);
    document.addEventListener("keydown", documentKey);
    const events = { loadedmetadata: loaded, durationchange: loaded, play: onPlay, pause: onPause, ended: onPause, timeupdate: onTime, seeked: onTime, error: onError, waiting: onWaiting, playing: onPlaying, canplay: onPlaying };
    for (const [name, listener] of Object.entries(events)) audio.addEventListener(name, listener);
    const observer = new ResizeObserver(draw); observer.observe(wave);
    if (source) { audio.src = source; buildWave(); }
    else { report("Запись недоступна.", false); playButton.disabled = true; }
    render(false);

    return {
      el, audio, seek,
      setMarkers(value) { markers = (Array.isArray(value) ? value : []).filter((item) => Number.isFinite(Number(item.time)) && Number(item.time) >= 0).map((item) => ({ ...item, time: Number(item.time) })); draw(); },
      setMetadata(value) { metadata = { ...metadata, ...value }; render(false); },
      destroy() {
        if (disposed) return;
        disposed = true; loadGeneration++; fetchController?.abort(); cancelAnimationFrame(frame); observer.disconnect();
        document.removeEventListener("keydown", documentKey);
        for (const [name, listener] of Object.entries(events)) audio.removeEventListener(name, listener);
        audio.pause(); audio.removeAttribute("src"); audio.load();
        audioContext?.close().catch(() => {}); audioContext = null;
      }
    };
  };
})();
