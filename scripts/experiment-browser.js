/**
 * Experiment browser — slide-out drawer that lists public experiments
 * from Supabase and lets users load one into the dashboard.
 */

function getSupabaseConfig() {
  const config = globalThis.__ILLUCIDATE_CONFIG || {};
  return {
    url: typeof config.supabaseUrl === "string" ? config.supabaseUrl.trim() : "",
    anonKey: typeof config.supabaseAnonKey === "string" ? config.supabaseAnonKey.trim() : "",
    bucket: typeof config.storageBucket === "string" ? config.storageBucket.trim() : "experiment-data"
  };
}

let cachedExperiments = null;

async function fetchExperiments() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase is not configured.");
  }

  const selectFields = [
    "experiment_id", "title", "description", "performed_at",
    "operator", "lab", "institution", "processed_json_path",
    "biological_system(genus,species,serotype,strain)",
    "instrument(make,model)",
    "experiment_perturbation(role,quantity_value,quantity_unit,perturbation(type,name))",
    "experiment_condition(parameter,value)"
  ].join(",");

  const params = new URLSearchParams({
    is_public: "eq.true",
    order: "performed_at.desc.nullslast",
    limit: "50",
    select: selectFields
  });

  const endpoint = `${config.url}/rest/v1/experiment?${params}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Fetch failed (${response.status}): ${detail}`);
  }

  return response.json();
}

async function fetchExperimentData(processedJsonPath) {
  const config = getSupabaseConfig();
  if (!processedJsonPath) {
    throw new Error("This experiment has no processed data file.");
  }

    const encodedBucket = encodeURIComponent(config.bucket);
  const encodedPath = processedJsonPath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const storageUrl = `${config.url}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
  const response = await fetch(storageUrl);
  if (!response.ok) {
    throw new Error(`Failed to load experiment data (${response.status})`);
  }
  return response.json();
}

function formatDate(dateStr) {
  if (!dateStr) {
    return "";
  }
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric"
    });
  } catch {
    return dateStr;
  }
}

function buildOrganismLine(bio) {
  if (!bio) {
    return "";
  }
  const parts = [bio.genus, bio.species, bio.serotype, bio.strain].filter(Boolean);
  return parts.join(" ");
}

function buildCardEl(exp, onLoadClick) {
  const card = document.createElement("article");
  card.className = "experiment-card";

  const title = document.createElement("h4");
  title.className = "experiment-card-title";
  title.textContent = exp.title || "Untitled experiment";
  card.appendChild(title);

  const organism = buildOrganismLine(exp.biological_system);
  if (organism) {
    const orgEl = document.createElement("p");
    orgEl.className = "experiment-card-organism";
    orgEl.textContent = organism;
    card.appendChild(orgEl);
  }

  const metaEl = document.createElement("div");
  metaEl.className = "experiment-card-meta";

  const chips = [];
  if (exp.lab) {
    chips.push(exp.lab);
  }
  if (exp.performed_at) {
    chips.push(formatDate(exp.performed_at));
  }
  if (exp.instrument) {
    const inst = [exp.instrument.make, exp.instrument.model].filter(Boolean).join(" ");
    if (inst) {
      chips.push(inst);
    }
  }

  for (const text of chips) {
    const chip = document.createElement("span");
    chip.className = "experiment-card-chip";
    chip.textContent = text;
    metaEl.appendChild(chip);
  }
  if (chips.length) {
    card.appendChild(metaEl);
  }

  if (Array.isArray(exp.experiment_perturbation) && exp.experiment_perturbation.length) {
    const pertEl = document.createElement("p");
    pertEl.className = "experiment-card-perturbations";
    const names = exp.experiment_perturbation
      .map((ep) => ep.perturbation?.name)
      .filter(Boolean);
    if (names.length) {
      pertEl.textContent = names.join(", ");
      card.appendChild(pertEl);
    }
  }

  if (exp.description) {
    const descEl = document.createElement("p");
    descEl.className = "experiment-card-desc";
    descEl.textContent = exp.description;
    card.appendChild(descEl);
  }

  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "experiment-card-load";
  loadBtn.textContent = "Load into Dashboard";
  loadBtn.addEventListener("click", () => onLoadClick(exp));
  card.appendChild(loadBtn);

  return card;
}

function buildDrawerContent(containerEl, experiments, onLoadClick) {
  const header = document.createElement("div");
  header.className = "experiment-drawer-header";

  const heading = document.createElement("h3");
  heading.textContent = "Public Experiments";
  header.appendChild(heading);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "experiment-drawer-close";
  closeBtn.setAttribute("aria-label", "Close drawer");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => closeDrawer(containerEl));
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "experiment-drawer-body";

  if (!experiments.length) {
    const empty = document.createElement("p");
    empty.className = "experiment-drawer-empty";
    empty.textContent = "No public experiments available yet.";
    body.appendChild(empty);
  } else {
    for (const exp of experiments) {
      body.appendChild(buildCardEl(exp, onLoadClick));
    }
  }

  containerEl.replaceChildren(header, body);
}

function openDrawer(containerEl, backdropEl) {
  if (!containerEl) {
    return;
  }
  containerEl.hidden = false;
  if (backdropEl) {
    backdropEl.hidden = false;
  }
  requestAnimationFrame(() => {
    containerEl.classList.add("is-open");
    if (backdropEl) {
      backdropEl.classList.add("is-visible");
    }
  });
}

function closeDrawer(containerEl, backdropEl) {
  if (!containerEl) {
    return;
  }
  const effectiveBackdrop = backdropEl || document.getElementById("drawer-backdrop");
  containerEl.classList.remove("is-open");
  if (effectiveBackdrop) {
    effectiveBackdrop.classList.remove("is-visible");
  }
  const onEnd = () => {
    containerEl.hidden = true;
    if (effectiveBackdrop) {
      effectiveBackdrop.hidden = true;
    }
    containerEl.removeEventListener("transitionend", onEnd);
  };
  containerEl.addEventListener("transitionend", onEnd);
}

export function initBrowser({ onLoad, containerEl, backdropEl, triggerEl }) {
  if (!containerEl || !triggerEl) {
    return;
  }

  containerEl.hidden = true;
  if (backdropEl) {
    backdropEl.hidden = true;
  }

  async function handleLoad(exp) {
    const loadBtns = containerEl.querySelectorAll(".experiment-card-load");
    for (const btn of loadBtns) {
      btn.disabled = true;
    }

    try {
      const dataset = await fetchExperimentData(exp.processed_json_path);
      onLoad(dataset, exp.title || "Untitled experiment");
      closeDrawer(containerEl);
    } catch (error) {
      const bodyEl = containerEl.querySelector(".experiment-drawer-body");
      if (bodyEl) {
        // Remove any existing error messages to avoid stacking multiple .empty-state elements
        bodyEl.querySelectorAll(".empty-state").forEach((el) => el.remove());
        const errEl = document.createElement("p");
        errEl.className = "empty-state";
        errEl.textContent = error.message;
        bodyEl.prepend(errEl);
      }
    } finally {
      for (const btn of loadBtns) {
        btn.disabled = false;
      }
    }
  }

  triggerEl.addEventListener("click", async () => {
    openDrawer(containerEl, backdropEl);

    if (cachedExperiments) {
      buildDrawerContent(containerEl, cachedExperiments, handleLoad);
      return;
    }

    containerEl.replaceChildren();
    const spinner = document.createElement("div");
    spinner.className = "drawer-spinner";
    spinner.setAttribute("aria-label", "Loading experiments");
    containerEl.appendChild(spinner);

    try {
      cachedExperiments = await fetchExperiments();
      buildDrawerContent(containerEl, cachedExperiments, handleLoad);
    } catch (error) {
      containerEl.replaceChildren();
      const errEl = document.createElement("p");
      errEl.className = "empty-state";
      errEl.style.margin = "var(--space-4)";
      errEl.textContent = `Failed to load experiments: ${error.message}`;
      containerEl.appendChild(errEl);
    }
  });

  if (backdropEl) {
    backdropEl.addEventListener("click", () => closeDrawer(containerEl));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && containerEl.classList.contains("is-open")) {
      closeDrawer(containerEl);
    }
  });
}
