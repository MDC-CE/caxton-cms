import { useState, useEffect, useRef } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronRight, ChevronUp, CircleCheck, CircleX, Code, Eye, Folder, Info, Laptop, List, Maximize, Monitor, Plus, RefreshCw, Save, Smartphone, Tablet, TestTube, X } from "lucide-react";
import { useSearch, useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SectionRenderer } from "@/components/SectionRenderer";
import { VariantGuidanceDialog } from "@/components/registry/VariantGuidanceDialog";
import type { Section } from "@shared/schema";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import jsYaml from "js-yaml";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}

interface VariantInfo {
  description?: string;
  best_for?: string;
}

interface ComponentSchema {
  name: string;
  version: string;
  component: string;
  file: string;
  description: string;
  when_to_use: string;
  props: Record<string, unknown>;
  variants?: Record<string, VariantInfo>;
}

function formatVariantLabel(variant: string): string {
  return variant
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

interface ComponentExample {
  name: string;
  description: string;
  yaml: string;
  variant?: string;
}

interface ComponentVersion {
  version: string;
  schema: ComponentSchema;
  examples: ComponentExample[];
}

interface ComponentInfo {
  type: string;
  versions: ComponentVersion[];
  latestVersion: string;
}

interface RegistryOverview {
  components: Array<{
    type: string;
    name: string;
    description: string;
    latestVersion: string;
    versions: string[];
  }>;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  file?: string;
}

interface ValidationResult {
  componentType: string;
  version: string;
  issues: ValidationIssue[];
  validVariants: string[];
}

function generateDefaultYaml(componentType: string, schema: ComponentSchema): string {
  const example: Record<string, unknown> = { type: componentType };
  
  if (schema.props) {
    for (const [key, prop] of Object.entries(schema.props)) {
      const propDef = prop as { example?: unknown; required?: boolean; type?: string };
      if (propDef.example !== undefined) {
        example[key] = propDef.example;
      } else if (propDef.required && propDef.type === 'string') {
        example[key] = `Example ${key}`;
      }
    }
  }
  
  return `- ${jsYaml.dump(example, { indent: 2, lineWidth: 80 }).trim().split('\n').join('\n  ')}`;
}

interface ComponentCardProps {
  componentType: string;
  componentInfo: ComponentInfo;
  globalYamlState: boolean | null;
  globalPreviewState: boolean | null;
  isFocused?: boolean;
  cardRef?: React.RefObject<HTMLDivElement>;
  allComponents?: Array<{ type: string; name: string; }>;
}

function ComponentCard({ 
  componentType, 
  componentInfo, 
  globalYamlState, 
  globalPreviewState, 
  isFocused, 
  cardRef,
  allComponents = []
}: ComponentCardProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(400);
  const [selectedVersion, setSelectedVersion] = useState(componentInfo.latestVersion);
  const [selectedExample, setSelectedExample] = useState<string | null>(null);
  const [showYaml, setShowYaml] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showAddExampleModal, setShowAddExampleModal] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'tablet' | 'laptop' | 'desktop'>('mobile');
  const [yamlContent, setYamlContent] = useState('');
  const [parsedData, setParsedData] = useState<Section | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => 
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const currentVersionData = componentInfo.versions.find(v => v.version === selectedVersion);
  const schema = currentVersionData?.schema;
  const examples = currentVersionData?.examples || [];

  const updateUrl = (newVersion?: string, newExample?: string | null) => {
    const v = newVersion || selectedVersion;
    const e = newExample !== undefined ? newExample : selectedExample;
    let url = `/private/component-showcase/${componentType}`;
    const params = new URLSearchParams();
    if (v) params.set('version', v);
    if (e) params.set('example', e);
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
    setLocation(url, { replace: true });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlVersion = params.get('version');
    const urlExample = params.get('example');
    if (urlVersion && componentInfo.versions.some(v => v.version === urlVersion)) {
      setSelectedVersion(urlVersion);
    }
    if (urlExample) {
      setSelectedExample(urlExample);
    }
  }, [componentInfo.versions]);

  const createVersionMutation = useMutation({
    mutationFn: async (baseVersion: string) => {
      const result = await apiRequest('POST', `/api/component-registry/${componentType}/create-version`, {
        baseVersion,
      });
      return result as unknown as { success: boolean; newVersion: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/component-registry'] });
      queryClient.invalidateQueries({ queryKey: ['/api/component-registry', componentType] });
      if (data.newVersion) {
        setSelectedVersion(data.newVersion);
        setSelectedExample(null);
      }
      toast({
        title: "Version created",
        description: `Created new version ${data.newVersion} for ${componentType}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create version",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveExampleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedExample) throw new Error("No example selected");
      const result = await apiRequest('POST', `/api/component-registry/${componentType}/${selectedVersion}/save-example`, {
        exampleName: selectedExample,
        yamlContent: yamlContent,
      });
      return result as unknown as { success: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/component-registry', componentType] });
      toast({
        title: "Example saved",
        description: `Saved changes to "${selectedExample}"`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save example",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (examples.length > 0 && !selectedExample) {
      setSelectedExample(examples[0].name);
    } else if (schema && !selectedExample && examples.length === 0) {
      const defaultYaml = generateDefaultYaml(componentType, schema);
      setYamlContent(defaultYaml);
      try {
        const parsed = jsYaml.load(defaultYaml);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setParsedData(parsed[0] as Section);
        }
      } catch {
        // Ignore parse errors on initial load
      }
    }
  }, [schema, componentType, selectedExample, examples]);

  useEffect(() => {
    if (selectedExample && examples.length > 0) {
      const example = examples.find(e => e.name === selectedExample);
      if (example) {
        setYamlContent(example.yaml);
        try {
          const parsed = jsYaml.load(example.yaml);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setParsedData(parsed[0] as Section);
          } else if (parsed && typeof parsed === 'object') {
            setParsedData(parsed as Section);
          }
          setParseError(null);
        } catch (err) {
          if (err instanceof Error) {
            setParseError(err.message);
          }
        }
      }
    }
  }, [selectedExample, examples]);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (globalYamlState !== null) {
      setShowYaml(globalYamlState);
    }
  }, [globalYamlState]);

  useEffect(() => {
    if (globalPreviewState !== null) {
      setShowPreview(globalPreviewState);
    }
  }, [globalPreviewState]);

  // Listen for iframe ready and height messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'preview-ready') {
        setIframeReady(true);
      }
      if (event.data?.type === 'preview-height') {
        setIframeHeight(event.data.height || 400);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Send data to iframe when ready or data changes
  useEffect(() => {
    if (iframeReady && iframeRef.current?.contentWindow && parsedData) {
      iframeRef.current.contentWindow.postMessage({
        type: 'preview-update',
        sections: [parsedData],
      }, '*');
    }
  }, [iframeReady, parsedData, selectedExample]);

  // Send theme to iframe when it changes
  useEffect(() => {
    if (iframeReady && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'theme-update',
        theme: isDarkMode ? 'dark' : 'light',
      }, '*');
    }
  }, [iframeReady, isDarkMode]);

  
  const handleYamlChange = (value: string) => {
    setYamlContent(value);
    try {
      const parsed = jsYaml.load(value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setParsedData(parsed[0] as Section);
        setParseError(null);
      } else if (parsed && typeof parsed === 'object') {
        setParsedData(parsed as Section);
        setParseError(null);
      }
    } catch (err) {
      if (err instanceof Error) {
        setParseError(err.message);
      }
    }
  };

  const handleReset = () => {
    if (selectedExample && examples.length > 0) {
      const example = examples.find(e => e.name === selectedExample);
      if (example) {
        setYamlContent(example.yaml);
        try {
          const parsed = jsYaml.load(example.yaml);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setParsedData(parsed[0] as Section);
          }
        } catch {
          // Ignore
        }
      }
    } else if (schema) {
      const defaultYaml = generateDefaultYaml(componentType, schema);
      setYamlContent(defaultYaml);
      try {
        const parsed = jsYaml.load(defaultYaml);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setParsedData(parsed[0] as Section);
        }
      } catch {
        // Ignore
      }
    }
    setParseError(null);
  };

  const handleVersionChange = (version: string) => {
    if (version === '__add_new__') {
      createVersionMutation.mutate(selectedVersion);
    } else {
      setSelectedVersion(version);
      setSelectedExample(null);
      updateUrl(version, null);
    }
  };

  const handleExampleChange = (example: string) => {
    if (example === '__add_new__') {
      setShowAddExampleModal(true);
    } else if (example === '__default__') {
      setSelectedExample(null);
      updateUrl(undefined, null);
    } else {
      setSelectedExample(example);
      updateUrl(undefined, example);
    }
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);
    try {
      const response = await fetch(`/api/component-registry/${componentType}/validate?version=${selectedVersion}`);
      const result = await response.json() as ValidationResult;
      setValidationResult(result);
    } catch (error) {
      toast({
        title: "Validation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const examplePath = `4geeks-com/component-registry/${componentType}/${selectedVersion}/examples/`;

  if (!schema) {
    return null;
  }

  return (
    <>
      <nav 
        ref={cardRef}
        className="sticky top-0 z-50 border-b py-3 px-[15px] bg-[#ffffff]"
        data-testid={`component-card-${componentType}`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{schema.name}</h1>
            <Badge variant="secondary">{componentType}</Badge>
          </div>
          <div className="flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Select value={selectedVersion} onValueChange={handleVersionChange}>
                <SelectTrigger className="w-32" data-testid={`select-version-${componentType}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {componentInfo.versions.map(v => (
                    <SelectItem key={v.version} value={v.version}>
                      {v.version}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Select 
                  value={selectedExample || (examples.length > 0 ? examples[0].name : '__default__')} 
                  onValueChange={handleExampleChange}
                >
                  <SelectTrigger className="h-7 px-2 text-sm font-medium w-[30%] sm:w-auto sm:min-w-[280px]" data-testid={`breadcrumb-example-${componentType}`}>
                    <SelectValue placeholder="Default">{selectedExample || 'Default'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="min-w-[280px]">
                    {examples.length === 0 && (
                      <SelectItem value="__default__">Default (from schema)</SelectItem>
                    )}
                    {(() => {
                      const grouped = examples.reduce((acc, ex) => {
                        const variant = ex.variant || 'default';
                        if (!acc[variant]) acc[variant] = [];
                        acc[variant].push(ex);
                        return acc;
                      }, {} as Record<string, typeof examples>);
                      
                      const schemaVariantOrder = schema.variants ? Object.keys(schema.variants) : [];
                      const sortedVariants = Object.keys(grouped).sort((a, b) => {
                        if (a === 'default') return 1;
                        if (b === 'default') return -1;
                        const aIdx = schemaVariantOrder.indexOf(a);
                        const bIdx = schemaVariantOrder.indexOf(b);
                        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
                        if (aIdx === -1) return 1;
                        if (bIdx === -1) return -1;
                        return aIdx - bIdx;
                      });
                      
                      return sortedVariants.map(variant => (
                        <SelectGroup key={variant}>
                          <SelectLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 pt-3 pb-1">
                            {formatVariantLabel(variant)}
                          </SelectLabel>
                          {grouped[variant].map(ex => (
                            <SelectItem key={ex.name} value={ex.name} className="pl-4">
                              {ex.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ));
                    })()}
                    <SelectItem value="__add_new__" className="text-primary mt-2 border-t border-border/50 pt-2">
                      <div className="flex items-center gap-1">
                        <Plus className="w-3 h-3" />
                        Add new example
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
            </div>
            {/* Mobile-only buttons row */}
            <div className="flex sm:hidden items-center gap-2 pt-[3px] pb-[3px]">
              {(() => {
                const currentExample = examples.find(ex => ex.name === selectedExample);
                if (!currentExample?.description) return null;
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        data-testid={`button-example-info-mobile-${componentType}`}
                      >
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 text-sm">
                      <p className="font-medium mb-1">{currentExample.name}</p>
                      <p className="text-muted-foreground">{currentExample.description}</p>
                    </PopoverContent>
                  </Popover>
                );
              })()}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleValidate}
                    disabled={isValidating}
                    className="h-8 px-2 text-xs"
                    data-testid={`button-test-integrity-mobile-${componentType}`}
                  >
                    <TestTube className="w-4 h-4 mr-1" />
                    {isValidating ? 'Testing...' : 'Test'}
                  </Button>
                </PopoverTrigger>
                {validationResult && (
                  <PopoverContent className="w-80 text-sm">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Validation Results</span>
                        <Badge variant={validationResult.issues.filter(i => i.type === 'error').length > 0 ? 'destructive' : 'secondary'}>
                          {validationResult.version}
                        </Badge>
                      </div>
                      {validationResult.issues.length === 0 ? (
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <CircleCheck className="w-4 h-4" />
                          <span>All checks passed!</span>
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {validationResult.issues.map((issue, idx) => (
                            <div key={idx} className={`flex items-start gap-2 text-xs ${issue.type === 'error' ? 'text-destructive' : 'text-yellow-600 dark:text-yellow-400'}`}>
                              {issue.type === 'error' ? (
                                <CircleX className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              ) : (
                                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              )}
                              <div>
                                <p>{issue.message}</p>
                                {issue.file && <p className="text-muted-foreground font-mono">{issue.file}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                )}
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/component-registry', componentType] });
                }}
                title="Reload examples"
                data-testid={`button-reload-examples-mobile-${componentType}`}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            {/* Desktop-only buttons */}
            <div className="hidden sm:flex items-center gap-2">
            <VariantGuidanceDialog
              componentType={componentType}
              version={selectedVersion}
              variant={examples.find(ex => ex.name === selectedExample)?.variant || examples[0]?.variant || 'default'}
            />
            {(() => {
              const currentExample = examples.find(ex => ex.name === selectedExample);
              if (!currentExample?.description) return null;
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      data-testid={`button-example-info-${componentType}`}
                    >
                      <Info className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 text-sm">
                    <p className="font-medium mb-1">{currentExample.name}</p>
                    <p className="text-muted-foreground">{currentExample.description}</p>
                  </PopoverContent>
                </Popover>
              );
            })()}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  disabled={isValidating}
                  className="h-8 px-2 text-xs"
                  data-testid={`button-test-integrity-${componentType}`}
                >
                  <TestTube className="w-4 h-4 mr-1" />
                  {isValidating ? 'Testing...' : 'Test'}
                </Button>
              </PopoverTrigger>
              {validationResult && (
                <PopoverContent className="w-80 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Validation Results</span>
                      <Badge variant={validationResult.issues.filter(i => i.type === 'error').length > 0 ? 'destructive' : 'secondary'}>
                        {validationResult.version}
                      </Badge>
                    </div>
                    {validationResult.issues.length === 0 ? (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CircleCheck className="w-4 h-4" />
                        <span>All checks passed!</span>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {validationResult.issues.map((issue, idx) => (
                          <div key={idx} className={`flex items-start gap-2 text-xs ${issue.type === 'error' ? 'text-destructive' : 'text-yellow-600 dark:text-yellow-400'}`}>
                            {issue.type === 'error' ? (
                              <CircleX className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            )}
                            <div>
                              <p>{issue.message}</p>
                              {issue.file && <p className="text-muted-foreground font-mono">{issue.file}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              )}
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/component-registry', componentType] });
              }}
              title="Reload examples"
              data-testid={`button-reload-examples-${componentType}`}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            </div>
          </div>
        </div>
      </nav>
      <div className="px-4 sm:px-8 lg:px-16 py-4">
      {!showYaml && (
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowYaml(true)}
            className="w-full"
            data-testid={`button-show-yaml-${componentType}`}
          >
            <Code className="w-4 h-4 mr-2" />
            Show YAML Editor
          </Button>
        </div>
      )}
      <Collapsible open={showYaml}>
        <CollapsibleContent>
          <div className="mb-4">
            <Card>
              <CardContent className="p-0">
                <div className="rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">YAML Editor</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => saveExampleMutation.mutate()}
                      disabled={!selectedExample || saveExampleMutation.isPending || !!parseError}
                      className="h-6 px-2 text-xs"
                      data-testid={`button-save-yaml-${componentType}`}
                    >
                      <Save className="w-3 h-3 mr-1" />
                      {saveExampleMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      className="h-6 px-2 text-xs"
                      data-testid={`button-reset-yaml-${componentType}`}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Reset
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowYaml(false)}
                      className="h-6 px-2 text-xs"
                      data-testid={`button-collapse-yaml-${componentType}`}
                    >
                      <ChevronUp className="w-3 h-3 mr-1" />
                      Collapse
                    </Button>
                  </div>
                </div>
                <CodeMirror
                  value={yamlContent}
                  height="auto"
                  minHeight="100px"
                  maxHeight="400px"
                  extensions={[yaml()]}
                  theme={isDarkMode ? oneDark : undefined}
                  onChange={handleYamlChange}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                  }}
                  className="text-sm"
                  data-testid={`editor-yaml-${componentType}`}
                />
                {parseError && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-destructive/10 border-t border-destructive/20 text-destructive text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span className="font-mono">{parseError}</span>
                  </div>
                )}
                </div>
              </CardContent>
            </Card>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Collapsible open={showPreview}>
        <CollapsibleContent>
          <div className="border rounded-lg overflow-hidden bg-background">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Preview</span>
                <span className="text-xs text-muted-foreground">
                  {previewViewport === 'mobile' ? '375 × 667' : previewViewport === 'tablet' ? '768 × 1024' : previewViewport === 'laptop' ? '1280 × 800' : '1440 × 900'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={previewViewport === 'mobile' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPreviewViewport('mobile')}
                  title="Mobile (375 × 667)"
                  data-testid={`button-viewport-mobile-${componentType}`}
                >
                  <Smartphone className="w-4 h-4" />
                </Button>
                <Button
                  variant={previewViewport === 'tablet' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPreviewViewport('tablet')}
                  title="Tablet (768 × 1024)"
                  data-testid={`button-viewport-tablet-${componentType}`}
                >
                  <Tablet className="w-4 h-4" />
                </Button>
                <Button
                  variant={previewViewport === 'laptop' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPreviewViewport('laptop')}
                  title="Laptop (1280 × 800)"
                  data-testid={`button-viewport-laptop-${componentType}`}
                >
                  <Laptop className="w-4 h-4" />
                </Button>
                <Button
                  variant={previewViewport === 'desktop' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPreviewViewport('desktop')}
                  title="Desktop (1440 × 900)"
                  data-testid={`button-viewport-desktop-${componentType}`}
                >
                  <Monitor className="w-4 h-4" />
                </Button>
                <div className="w-px h-4 bg-border mx-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (selectedExample) {
                      window.location.href = `/private/component-showcase/${componentType}/preview?debug=false&version=${selectedVersion}&example=${encodeURIComponent(selectedExample)}`;
                    } else if (parsedData) {
                      sessionStorage.setItem('preview-sections', JSON.stringify([parsedData]));
                      sessionStorage.setItem('preview-theme', isDarkMode ? 'dark' : 'light');
                      window.location.href = `/private/component-showcase/${componentType}/preview?debug=false&version=${selectedVersion}`;
                    }
                  }}
                  title="Full page preview"
                  data-testid={`button-fullpage-preview-${componentType}`}
                >
                  <Maximize className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className={`bg-muted/20 ${previewViewport !== 'desktop' && previewViewport !== 'laptop' ? 'flex justify-center py-4' : ''}`}>
              <div 
                className={`bg-background transition-all duration-300 overflow-hidden ${
                  previewViewport === 'mobile' 
                    ? 'w-[375px] shadow-lg' 
                    : previewViewport === 'tablet' 
                      ? 'w-[768px] shadow-lg' 
                      : previewViewport === 'laptop'
                        ? 'w-[1280px] shadow-lg'
                        : 'w-full'
                }`}
              >
                <iframe
                  ref={iframeRef}
                  src={`/private/component-showcase/${componentType}/preview?debug=false&version=${selectedVersion}&example=${encodeURIComponent(selectedExample || '')}`}
                  className="w-full border-0"
                  style={{ 
                    height: previewViewport === 'mobile' 
                      ? '667px'  // iPhone SE/8 screen height
                      : previewViewport === 'tablet'
                        ? '1024px'  // iPad portrait height
                        : previewViewport === 'laptop'
                          ? '800px'  // Laptop height (1280×800)
                          : '900px',  // Desktop height (1440×900)
                    minHeight: '200px',
                  }}
                  title={`Preview ${componentType}`}
                  data-testid={`iframe-preview-${componentType}`}
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      </div>
      <Dialog open={showAddExampleModal} onOpenChange={setShowAddExampleModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="w-5 h-5" />
              Add New Example for {schema?.name || componentType}
            </DialogTitle>
            <DialogDescription>
              Create a new YAML example file demonstrating a specific use case.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Step 1: Create File</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Create a new <code className="px-1 bg-muted rounded">.yml</code> file in:
              </p>
              <code className="block p-3 bg-muted rounded-lg text-sm break-all">
                {examplePath}
              </code>
              <p className="text-xs text-muted-foreground mt-1">
                Use descriptive names like <code className="px-1 bg-muted/50 rounded">minimal.yml</code>, <code className="px-1 bg-muted/50 rounded">with-all-features.yml</code>, or <code className="px-1 bg-muted/50 rounded">spanish-content.yml</code>
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Step 2: File Structure</h4>
              <p className="text-sm text-muted-foreground mb-2">
                Each example file must have <code className="px-1 bg-muted rounded">name</code>, <code className="px-1 bg-muted rounded">description</code>, and <code className="px-1 bg-muted rounded">yaml</code> fields:
              </p>
              <pre className="p-3 bg-muted rounded-lg text-sm overflow-x-auto">
{`name: "Descriptive Example Name"
description: "When and why to use this variant"
yaml: |
  - type: ${componentType}
    version: "${selectedVersion}"
${schema?.props ? Object.entries(schema.props).slice(0, 4).map(([key, prop]) => {
  const p = prop as { type?: string; example?: unknown };
  const example = p.example !== undefined ? 
    (typeof p.example === 'string' ? `"${p.example}"` : JSON.stringify(p.example)) : 
    (p.type === 'string' ? '"..."' : '...');
  return `    ${key}: ${example}`;
}).join('\n') : '    # props here'}`}
              </pre>
            </div>
            
            {schema?.props && Object.keys(schema.props).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Available Props</h4>
                <div className="max-h-32 overflow-y-auto p-2 bg-muted/50 rounded-lg">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(schema.props).map(([key, prop]) => {
                      const p = prop as { required?: boolean };
                      return (
                        <Badge 
                          key={key} 
                          variant={p.required ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {key}{p.required ? '*' : ''}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">* = required</p>
              </div>
            )}
            
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                After creating the file, refresh this page to see your new example in the dropdown.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ComponentShowcase() {
  useNoIndex();
  
  const { componentType } = useParams<{ componentType?: string }>();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const focusedComponent = searchParams.get('focus');
  
  const [globalYamlState, setGlobalYamlState] = useState<boolean | null>(null);
  const [globalPreviewState, setGlobalPreviewState] = useState<boolean | null>(null);
  const [yamlExpanded, setYamlExpanded] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [yamlTrigger, setYamlTrigger] = useState(0);
  const [previewTrigger, setPreviewTrigger] = useState(0);
  const [highlightedComponent, setHighlightedComponent] = useState<string | null>(focusedComponent);
  
  const cardRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

  const { data: registry, isLoading: registryLoading } = useQuery<RegistryOverview>({
    queryKey: ['/api/component-registry'],
  });

  const { data: singleComponent, isLoading: singleLoading } = useQuery<ComponentInfo>({
    queryKey: ['/api/component-registry', componentType],
    enabled: !!componentType,
  });

  const components = registry?.components || [];
  
  components.forEach(comp => {
    if (!cardRefs.current[comp.type]) {
      cardRefs.current[comp.type] = { current: null } as React.RefObject<HTMLDivElement>;
    }
  });
  
  useEffect(() => {
    if (focusedComponent && cardRefs.current[focusedComponent]?.current) {
      setTimeout(() => {
        cardRefs.current[focusedComponent]?.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
      
      setTimeout(() => {
        setHighlightedComponent(null);
      }, 3000);
    }
  }, [focusedComponent]);

  const toggleAllYaml = () => {
    const newState = !yamlExpanded;
    setYamlExpanded(newState);
    setGlobalYamlState(newState);
    setYamlTrigger(prev => prev + 1);
  };

  const toggleAllPreview = () => {
    const newState = !previewExpanded;
    setPreviewExpanded(newState);
    setGlobalPreviewState(newState);
    setPreviewTrigger(prev => prev + 1);
  };

  // Single component view
  if (componentType) {
    if (singleLoading) {
      return (
        <div className="min-h-screen bg-background">
          <main className="container mx-auto px-4 py-8">
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-muted-foreground">Loading component...</p>
            </div>
          </main>
        </div>
      );
    }

    if (!singleComponent) {
      return (
        <div className="min-h-screen bg-background">
          <main className="container mx-auto px-4 py-8">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-3xl font-bold mb-4">Component Not Found</h1>
              <p className="text-muted-foreground mb-6">
                The component "{componentType}" does not exist.
              </p>
              <Link href="/private/component-showcase">
                <Button variant="outline" data-testid="link-back-to-showcase">
                  <List className="w-4 h-4 mr-2" />
                  View All Components
                </Button>
              </Link>
            </div>
          </main>
        </div>
      );
    }

    const currentIndex = components.findIndex(c => c.type === componentType);
    const prevComponent = currentIndex > 0 ? components[currentIndex - 1] : null;
    const nextComponent = currentIndex < components.length - 1 ? components[currentIndex + 1] : null;

    return (
      <div className="min-h-screen bg-background">
        <ComponentCard 
          key={componentType} 
          componentType={componentType}
          componentInfo={singleComponent}
          globalYamlState={null}
          globalPreviewState={true}
          isFocused={false}
          cardRef={cardRefs.current[componentType]}
          allComponents={components.map(c => ({ type: c.type, name: c.name }))}
        />
      </div>
    );
  }

  // All components view
  if (registryLoading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-muted-foreground">Loading components...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <AllComponentsLoader 
            components={components}
            globalYamlState={globalYamlState}
            globalPreviewState={globalPreviewState}
            yamlTrigger={yamlTrigger}
            previewTrigger={previewTrigger}
            highlightedComponent={highlightedComponent}
            cardRefs={cardRefs}
          />
        </div>
      </main>
    </div>
  );
}

interface AllComponentsLoaderProps {
  components: RegistryOverview['components'];
  globalYamlState: boolean | null;
  globalPreviewState: boolean | null;
  yamlTrigger: number;
  previewTrigger: number;
  highlightedComponent: string | null;
  cardRefs: React.MutableRefObject<Record<string, React.RefObject<HTMLDivElement>>>;
}

function AllComponentsLoader({ 
  components, 
  globalYamlState, 
  globalPreviewState, 
  yamlTrigger, 
  previewTrigger,
  highlightedComponent,
  cardRefs 
}: AllComponentsLoaderProps) {
  const allComponents = components.map(c => ({ type: c.type, name: c.name }));
  return (
    <>
      {components.map((comp) => (
        <ComponentCardLoader
          key={`${comp.type}-${yamlTrigger}-${previewTrigger}`}
          componentType={comp.type}
          globalYamlState={globalYamlState}
          globalPreviewState={globalPreviewState}
          isFocused={highlightedComponent === comp.type}
          cardRef={cardRefs.current[comp.type]}
          allComponents={allComponents}
        />
      ))}
    </>
  );
}

interface ComponentCardLoaderProps {
  componentType: string;
  globalYamlState: boolean | null;
  globalPreviewState: boolean | null;
  isFocused: boolean;
  cardRef?: React.RefObject<HTMLDivElement>;
  allComponents?: Array<{ type: string; name: string; }>;
}

function ComponentCardLoader({ 
  componentType, 
  globalYamlState, 
  globalPreviewState, 
  isFocused,
  cardRef,
  allComponents = []
}: ComponentCardLoaderProps) {
  const { data: componentInfo, isLoading } = useQuery<ComponentInfo>({
    queryKey: ['/api/component-registry', componentType],
  });

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <div className="h-6 w-48 bg-muted animate-pulse rounded" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
      </Card>
    );
  }

  if (!componentInfo) {
    return null;
  }

  return (
    <ComponentCard
      componentType={componentType}
      componentInfo={componentInfo}
      globalYamlState={globalYamlState}
      globalPreviewState={globalPreviewState}
      isFocused={isFocused}
      cardRef={cardRef}
      allComponents={allComponents}
    />
  );
}
