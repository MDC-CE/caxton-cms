import { useQuery } from "@tanstack/react-query";
import { useSession, useSessionOptional } from "@/contexts/SessionContext";
import {
  resolveDeep,
  resolveTemplateString,
  type VariableDefinition,
  type VariableContext,
  type ResolvedVariable,
} from "@/lib/variable-manager";

export function useVariableDefinitions() {
  return useQuery<Record<string, VariableDefinition>>({
    queryKey: ["/api/variables"],
    staleTime: 60_000,
  });
}

export function useVariableContext(): VariableContext {
  // Soft-fallback: Vite HMR can briefly remount Page outside SessionProvider.
  // Variable resolution must not blank the public page.
  const ctx = useSessionOptional();
  const session = ctx?.session;
  return {
    location: session?.location?.slug,
    region: session?.location?.region,
    locale: session?.language ?? "en",
  };
}

export function useResolvedContent<T>(rawData: T | undefined): {
  data: T | undefined;
  variables: ResolvedVariable[];
  definitions: Record<string, VariableDefinition>;
  context: VariableContext;
} {
  const { data: definitions } = useVariableDefinitions();
  const context = useVariableContext();

  if (!rawData || !definitions) {
    return { data: rawData, variables: [], definitions: definitions || {}, context };
  }

  const result = resolveDeep(rawData, definitions, context);
  return {
    data: result.data as T,
    variables: result.variables,
    definitions,
    context,
  };
}

export function useResolveString() {
  const { data: definitions } = useVariableDefinitions();
  const context = useVariableContext();

  if (!definitions) return (text: string) => ({ text, variables: [] as ResolvedVariable[] });
  return (text: string) => resolveTemplateString(text, definitions, context);
}
