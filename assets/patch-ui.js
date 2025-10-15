// assets/patch-ui.js — non-destructive UI patch (keeps your existing boxes/styles)
(function () {
  function applyPatch() {
    // 1) Add "Price: " label inside the .price element so it inherits the same styling
    document.querySelectorAll('.price').forEach(el => {
      const t = (el.textContent || '').trim();
      if (t && !/^price:/i.test(t)) {
        el.textContent = `Price: ${t}`;
      }
    });

    // 2) Split "Miles: X • Available: Y" into two lines and rename to "First Available Date"
    //    We DO NOT touch structure beyond duplicating the same .meta element for the second line.
    document.querySelectorAll('.meta').forEach(el => {
      const txt = (el.textContent || '').trim();
      // Look for the single-line pattern with a bullet or dash
      if (/Miles:\s*/i.test(txt) && /Available:\s*/i.test(txt) && /•| - /.test(txt)) {
        // Extract parts
        const milesMatch = txt.match(/Miles:\s*([^•-]+)/i);
        const availMatch = txt.match(/Available:\s*(.*)$/i);

        // Rewrite current line to just Miles
        if (milesMatch) el.textContent = `Miles: ${milesMatch[1].trim()}`;

        // Insert a new sibling line with the same class for the Available date
        const line2 = document.createElement('div');
        line2.className = el.className;
        const availVal = (availMatch && availMatch[1] ? availMatch[1].trim() : '');
        line2.textContent = `First Available Date: ${availVal}`;
        el.insertAdjacentElement('afterend', line2);
      }
    });
  }

  // Run once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPatch);
  } else {
    applyPatch();
  }

  // Re-run shortly after in case your list renders asynchronously
  setTimeout(applyPatch, 600);
})();
