import { Suspense } from "react";
import TemplateEditorClient from "./TemplateEditorClient";

export default function TemplateEditorPage() {
  return (
    <Suspense fallback={null}>
      <TemplateEditorClient />
    </Suspense>
  );
}
