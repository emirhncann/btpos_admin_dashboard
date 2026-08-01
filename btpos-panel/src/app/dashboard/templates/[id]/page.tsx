import TemplateEditorClient from "./TemplateEditorClient";

export function generateStaticParams() {
  return [{ id: "new" }];
}

export default function TemplateEditorPage() {
  return <TemplateEditorClient />;
}
