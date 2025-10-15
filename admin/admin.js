
(function(){
  const repo = (window.__REPO__||"").trim();
  const config = {
    backend: { name:'github', repo, branch:'main' },
    media_folder: "assets/uploads",
    public_folder: "/assets/uploads",
    collections: [{
      name: "loads",
      label: "Loads",
      files: [{
        file: "assets/loads.json",
        label: "All Loads",
        name: "loadsFile",
        format: "json",
        fields: [{
          label: "Loads",
          name: "loads",
          widget: "list",
          summary: "{{fields.item}} — {{fields.from_city}} → {{fields.to_city}}",
          fields: [
            { label: "ID", name: "id", widget: "number" },
            { label: "Item", name: "item", widget: "string" },
            { label: "From City", name: "from_city", widget: "string" },
            { label: "To City", name: "to_city", widget: "string" },
            { label: "Miles", name: "miles", widget: "number" },
            { label: "Available Date", name: "date", widget: "string" },
            { label: "Price", name: "price", widget: "string", required: false },
            { label: "Commodity", name: "commodity", widget: "select", options: ["Vehicle","Boat","Motorcycle","Household","LTL","Pets","Heavy Equipment"] },
            { label: "Status", name: "status", widget: "select", options: ["open","pending","awarded"] }
          ]
        }]
      }]
    }]
  };
  if(window.CMS){ window.CMS.init({ config }); }
})();
