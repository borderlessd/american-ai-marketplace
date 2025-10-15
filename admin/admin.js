const repo = "borderlessd/american-ai-marketplace";
const config = {
  backend: { name: "github", repo, branch: "main" },
  media_folder: "assets/uploads",
  public_folder: "/assets/uploads",
  collections: [ /* Loads config … */ ]
};
if (window.CMS) window.CMS.init({ config });
