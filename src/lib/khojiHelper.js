export const isKhojiField = (name) => {
  if (!name) return false;
  const c = name.toLowerCase().trim();
  if (c.includes("city") || c.includes("state") || c.includes("country")) return false;
  return (
    c === "khoji" ||
    c.includes("khoji") ||
    c.includes("asmani") ||
    c.includes("aasmani") ||
    c.includes("आसमानी") ||
    c.includes("mahasamnai") ||
    c.includes("mahasmani") ||
    c.includes("mahaasmani") ||
    c.includes("maha samnai")
  );
};
