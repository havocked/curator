const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeArtistName } = require("../dist/lib/artist");

describe("normalizeArtistName", () => {
  it("returns simple names unchanged", () => {
    assert.equal(normalizeArtistName("Daft Punk"), "Daft Punk");
    assert.equal(normalizeArtistName("Radiohead"), "Radiohead");
    assert.equal(normalizeArtistName("AC/DC"), "AC/DC");
    assert.equal(normalizeArtistName("Fontaines D.C."), "Fontaines D.C.");
  });

  it("strips feat. / ft. / featuring", () => {
    assert.equal(normalizeArtistName("Daft Punk feat. Pharrell Williams"), "Daft Punk");
    assert.equal(normalizeArtistName("Daft Punk ft. Pharrell"), "Daft Punk");
    assert.equal(normalizeArtistName("Daft Punk ft Pharrell"), "Daft Punk");
    assert.equal(normalizeArtistName("Daft Punk featuring Pharrell"), "Daft Punk");
  });

  it("strips with", () => {
    assert.equal(normalizeArtistName("David Guetta with Sia"), "David Guetta");
  });

  it("preserves & in band names (too ambiguous to split)", () => {
    assert.equal(normalizeArtistName("Iron & Wine"), "Iron & Wine");
    assert.equal(normalizeArtistName("Simon & Garfunkel"), "Simon & Garfunkel");
    assert.equal(normalizeArtistName("Above & Beyond"), "Above & Beyond");
    assert.equal(normalizeArtistName("Gorillaz & Little Simz"), "Gorillaz & Little Simz");
  });

  it("strips parenthetical suffixes", () => {
    assert.equal(
      normalizeArtistName("Silk Sonic (Bruno Mars & Anderson .Paak)"),
      "Silk Sonic"
    );
    assert.equal(
      normalizeArtistName("Jack Ü (Skrillex & Diplo)"),
      "Jack Ü"
    );
  });

  it("preserves comma in band names (Tyler, The Creator)", () => {
    assert.equal(normalizeArtistName("Tyler, The Creator"), "Tyler, The Creator");
  });

  it("strips comma-separated second artist", () => {
    assert.equal(normalizeArtistName("KAYTRANADA, H.E.R."), "KAYTRANADA");
    assert.equal(normalizeArtistName("Metro Boomin, Future"), "Metro Boomin");
  });

  it("handles Guns N' Roses (apostrophe in name)", () => {
    assert.equal(normalizeArtistName("Guns N' Roses"), "Guns N' Roses");
  });

  it("handles combined patterns (feat inside parens)", () => {
    assert.equal(
      normalizeArtistName("Major Lazer feat. MØ & DJ Snake"),
      "Major Lazer"
    );
  });
});
