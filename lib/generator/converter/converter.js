import { Comment, TmplAstBoundText, TmplAstElement, TmplAstText, } from "@angular/compiler";
import jsdom from "jsdom";
import { existsSync, readFileSync } from "node:fs";
import { parse, AST_NODE_TYPES, } from "@typescript-eslint/typescript-estree";
export class OriginalLocations {
    locations = new Map();
    file;
    addToList(node) {
        this.file = node.sourceSpan.start.file;
        const locations = this.locations.get(node.name) || [];
        this.locations.set(node.name, [...locations, node.sourceSpan.start]);
    }
    getLocations(name) {
        return this.locations.get(name);
    }
    getFile() {
        return this.file;
    }
}
export const convertParsedTemplatesToHTMLFragments = (parsedTemplates) => parsedTemplates.map(convertParsedTemplateToHTMLFragment);
const convertParsedTemplateToHTMLFragment = (parsedTemplate) => {
    const originalLocations = new OriginalLocations();
    const domNodes = parsedTemplate.nodes.map((node) => convertAstNodeToDomNode(node, originalLocations));
    const domDocument = new jsdom.JSDOM().window.document;
    const div = domDocument.createElement("div");
    domNodes.forEach((domNode) => {
        if (domNode) {
            div.appendChild(domNode);
        }
    });
    return { htmlFragment: div.innerHTML, originalLocations };
};
const convertAstNodeToDomNode = (astNode, originalLocations) => {
    const { JSDOM } = jsdom;
    const { document } = new JSDOM().window;
    if (astNode instanceof TmplAstElement) {
        return convertAstElementToDomNode(astNode, document, originalLocations);
    }
    if (astNode instanceof TmplAstBoundText) {
        return convertAstBoundTextToDomNode(document);
    }
    if (astNode instanceof TmplAstText) {
        return convertAstTextToDomNode(astNode, document);
    }
    if (astNode instanceof Comment) {
        return convertAstCommentToDomNode(astNode, document);
    }
};
const convertAstElementToDomNode = (astElement, document, originalLocations) => {
    const element = document.createElement(astElement.name);
    originalLocations.addToList(astElement);
    astElement.attributes.forEach((attribute) => {
        // Markuplint throws error for illegal characters in template
        element.setAttribute(attribute.name.replaceAll("$", ""), attribute.value);
        originalLocations.addToList(attribute);
    });
    astElement.inputs.forEach((input) => {
        const boundVariableName = input?.value?.ast?.name;
        // Markuplint throws error for illegal characters in template
        element.setAttribute(input.name.replaceAll("$", ""), retrieveBoundValueFromComponentTS(input) || boundVariableName || "some random text");
        originalLocations.addToList(input);
    });
    const domChildren = astElement.children.map((child) => convertAstNodeToDomNode(child, originalLocations));
    domChildren.forEach((child) => {
        if (child) {
            element.appendChild(child);
        }
    });
    return element;
};
const convertAstBoundTextToDomNode = (document) => {
    return document.createTextNode("some random text");
};
const convertAstTextToDomNode = (astText, document) => {
    return document.createTextNode(astText.value);
};
const convertAstCommentToDomNode = (astComment, document) => {
    if (astComment.value) {
        return document.createComment(astComment.value);
    }
};
const retrieveBoundValueFromComponentTS = (input) => {
    const componentFile = input.sourceSpan.start.file.url.replace(".html", ".ts");
    if (existsSync(componentFile)) {
        const code = readFileSync(componentFile, { encoding: "utf8" });
        const ast = parse(code, {
            loc: true,
            range: true,
        });
        const namedExport = ast.body.find((body) => body.type === AST_NODE_TYPES.ExportNamedDeclaration &&
            body.declaration?.type === AST_NODE_TYPES.ClassDeclaration &&
            body.declaration?.id?.name.includes("Component"));
        const classDeclaration = namedExport?.declaration;
        const classBody = classDeclaration?.body;
        const propertyDefinition = classBody?.body?.find((node) => node.type === AST_NODE_TYPES.PropertyDefinition &&
            node.key.type === AST_NODE_TYPES.Identifier &&
            node.key.name ===
                input?.value?.ast?.name);
        if (propertyDefinition?.value?.type === AST_NODE_TYPES.Literal) {
            return propertyDefinition.value?.value;
        }
    }
};
