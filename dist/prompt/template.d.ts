export interface TemplateVars {
    issue: {
        number: number;
        title: string;
        body: string;
        labels: string;
        author: string;
    };
    repo: {
        name: string;
        full_name: string;
    };
    comment: {
        body: string;
    };
}
export declare function renderTemplate(template: string, vars: TemplateVars): string;
//# sourceMappingURL=template.d.ts.map