import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BusinessProfileFields } from "@/components/intake/BusinessProfileFields";
import { emptyBusinessProfile } from "@/lib/businessProfile";

describe("required business profile fields", () => {
  it("starts with explicit blank state and industry choices, and labels every required answer", () => {
    const html = renderToStaticMarkup(createElement(BusinessProfileFields, { value: emptyBusinessProfile(), onChange: () => {} }));
    expect(html).toContain("Business street address");
    expect(html).toContain("ZIP code");
    for (const code of ["AS", "GU", "MP", "PR", "VI", "AA", "AE", "AP"]) expect(html).toContain(`value="${code}"`);
    expect(html).toContain('value="" selected=""');
    expect(html).not.toContain('value="other" selected=""');
    expect(html).toContain("Select industry");
    expect(html).toContain("NAICS classification");
    expect(html.match(/required=""/g)).toHaveLength(7);
    expect(html).toContain('maxLength="1000"');
  });

  it("uses Spanish address and industry choices and preserves entered answers", () => {
    const html = renderToStaticMarkup(createElement(BusinessProfileFields, { value: { ...emptyBusinessProfile(), business_zip: "00123-4567", industry: "professional_practice", business_website: "N/A" }, language: "es", onChange: () => {} }));
    expect(html).toContain("Dirección del negocio");
    expect(html).toContain("Código postal");
    expect(html).toContain("Servicios profesionales y médicos");
    expect(html).toContain('value="professional_practice" selected=""');
    expect(html).toContain('value="00123-4567"');
    expect(html).toContain('value="N/A"');
  });

  it("adds only the missing address and industry controls to existing public forms", () => {
    const html = renderToStaticMarkup(createElement(BusinessProfileFields, { value: emptyBusinessProfile(), includeWebsiteDescription: false, onChange: () => {} }));
    expect(html.match(/required=""/g)).toHaveLength(5);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain('autoComplete="section-business url"');
  });
});
