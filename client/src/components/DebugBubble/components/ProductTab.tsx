/**
 * SEO modal Product tab — entry-local sellable status (not Funnel bindings).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ExternalLink,
  Info,
  Loader2,
  Pause,
  Play,
  ShoppingBag,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useDebugAuth } from "@/hooks/useDebugAuth";
import { apiRequest } from "@/lib/queryClient";
import { getSessionHeaders } from "@/lib/sessionHeaders";
import type { ContentInfo } from "@/components/DebugBubble/types";

type ProductSnapshot = {
  product_id: string;
  name: string;
  description?: string;
  content_type: string;
  content_slug: string;
  purchasable: boolean;
  actively_selling: boolean;
  offer?: {
    one_liner?: string;
    who_its_for?: string;
    who_its_not_for?: string;
  };
  personas?: Array<{ id: string; label?: string; role: string }>;
  audience_status: "missing" | "minimal" | "complete";
  relative_path: string;
};

type ProductGetResponse = {
  product: ProductSnapshot;
  status: string;
  funnel_binding_pages?: Array<{ contentType: string; slug: string; href?: string }>;
  warnings?: Array<{ code: string; message: string }>;
};

type TypeConfigResponse = {
  products?: { allow_sellable_entries?: boolean; coerced_from_inventory?: boolean } | null;
};

export function useContentTypeAllowsSellable(contentType: string | null | undefined) {
  return useQuery({
    queryKey: ["/api/content-types", contentType, "config"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/content-types/${contentType}/config`);
      return (await res.json()) as TypeConfigResponse;
    },
    enabled: !!contentType,
    staleTime: 60_000,
    select: (data) => data.products?.allow_sellable_entries === true,
  });
}

export function ProductTab({
  contentInfo,
}: {
  contentInfo: ContentInfo;
  contentTypeLabel?: string;
  portalContainer?: HTMLElement | null;
  locale?: string;
  variant?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasCapability } = useDebugAuth();
  const ct = contentInfo.type || "";
  const slug = contentInfo.slug || "";
  const canManage = hasCapability("product_manage", ct);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [`/api/product/${slug}`, { content_type: ct }],
    queryFn: async () => {
      const res = await fetch(
        `/api/product/${encodeURIComponent(slug)}?content_type=${encodeURIComponent(ct)}`,
        { credentials: "include", headers: { ...getSessionHeaders() } },
      );
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || res.statusText);
      }
      return (await res.json()) as ProductGetResponse;
    },
    enabled: !!ct && !!slug,
  });

  const putMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiRequest("PUT", `/api/product/${slug}`, {
        content_type: ct,
        ...body,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/product/${slug}`] });
      void queryClient.invalidateQueries({ queryKey: ["/api/product"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/products"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/product-map"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not update product", description: err.message, variant: "destructive" });
    },
  });

  if (!ct || !slug) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
        Open from a content entry to manage product status.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading product…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">
        {(error as Error)?.message || "Failed to load product"}
      </div>
    );
  }

  const product = data?.product;
  const bindings = data?.funnel_binding_pages ?? [];
  const notAProduct = !product;
  const removed = product && !product.purchasable;
  const selling = product?.purchasable && product.actively_selling !== false;

  return (
    <div className="space-y-4 pt-2" data-testid="panel-product-tab">
      <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground space-y-2">
        <p className="text-foreground font-medium flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0" />
          This entry as a product
        </p>
        <p>
          Whether this entry is sellable and for sale. Journey stage and which products this page
          promotes live under Funnel. Audience depth is edited in the Store.
        </p>
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ChevronDown className="h-3.5 w-3.5" />
            Read more (advanced)
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 font-mono text-[11px] space-y-1">
            <p>{product?.relative_path ?? `${ct}/{slug}/_product.yml`}</p>
            <p>purchasable — in product index · actively_selling — pause store surfaces</p>
            <p>Lead-form catalogs use purchasable=true — not actively_selling</p>
            <p>products.allow_sellable_entries on content-types.yml</p>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {notAProduct && (
        <Card data-testid="card-product-empty">
          <CardContent className="py-8 text-center space-y-3">
            <ShoppingBag className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">This page is not a sellable product yet</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Make it sellable to add it to the store index. You can add offer and personas afterward
              in Store.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={!canManage || putMutation.isPending}
                  data-testid="button-make-sellable"
                >
                  Make sellable
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Make {slug} sellable?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Creates a product for this entry and shows it as selling. Does not change page
                    copy or Funnel bindings. Audience can be filled in later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      putMutation.mutate(
                        { purchasable: true },
                        {
                          onSuccess: () =>
                            toast({
                              title: "Product is sellable",
                              description: "Visible in the store index. Add audience in Store when ready.",
                            }),
                        },
                      );
                    }}
                    data-testid="button-confirm-make-sellable"
                  >
                    Make sellable
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {!canManage && (
              <p className="text-xs text-muted-foreground">
                Needs the Manage products (sellable) permission for this type.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {product && (
        <>
          {removed && (
            <div
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
              data-testid="banner-not-sellable"
            >
              <p className="font-medium text-foreground">Not sellable right now</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Removed from the store index. Offer and personas are kept. This is not the same as
                paused. Make sellable again to restore selling.
              </p>
            </div>
          )}

          <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
            <Card className="min-w-0" data-testid="card-product-status-purchasable">
              <CardContent className="pt-4 pb-3 space-y-1">
                <p className="text-xs text-muted-foreground">Purchasable</p>
                <p className="text-sm font-medium">{product.purchasable ? "Yes" : "No"}</p>
              </CardContent>
            </Card>
            <Card className="min-w-0" data-testid="card-product-status-selling">
              <CardContent className="pt-4 pb-3 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  {product.purchasable && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          disabled={!canManage || putMutation.isPending}
                          aria-label={selling ? "Pause selling" : "Resume selling"}
                          data-testid="button-toggle-selling"
                        >
                          {selling ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {selling ? `Pause selling for ${product.name}?` : `Resume selling for ${product.name}?`}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {selling
                              ? "Hidden from selling surfaces. Pages and funnels stay as they are. Prefer this over removing the product if the pause is temporary."
                              : "Visible on selling surfaces again."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              putMutation.mutate(
                                { actively_selling: !selling },
                                {
                                  onSuccess: () =>
                                    toast({
                                      title: selling ? "Product paused" : "Product is selling again",
                                    }),
                                },
                              );
                            }}
                          >
                            {selling ? "Pause selling" : "Resume selling"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
                <p className="text-sm font-medium">
                  {removed ? "Not sellable" : selling ? "Selling" : "Paused"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {removed
                    ? "Out of store index"
                    : selling
                      ? "Visible on store journey"
                      : "Hidden from selling surfaces"}
                </p>
              </CardContent>
            </Card>
            <Card className="min-w-0" data-testid="card-product-status-audience">
              <CardContent className="pt-4 pb-3 space-y-1">
                <p className="text-xs text-muted-foreground">Audience</p>
                <p className="text-sm font-medium capitalize">{product.audience_status}</p>
                <p className="text-xs text-muted-foreground">
                  {(product.personas?.length ?? 0) || 0} persona
                  {(product.personas?.length ?? 0) === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate" data-testid="text-product-name">
                    {product.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{product.product_id}</p>
                </div>
                <Link href={`/private/store/product/${product.content_slug}`}>
                  <Button type="button" size="sm" variant="secondary" data-testid="link-open-store">
                    Open in Store
                    <ExternalLink className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
              {product.offer?.one_liner && (
                <p className="text-muted-foreground">{product.offer.one_liner}</p>
              )}
              {product.offer?.who_its_for && (
                <p className="text-xs text-muted-foreground">
                  Who it&apos;s for: {product.offer.who_its_for}
                </p>
              )}
              {product.personas && product.personas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {product.personas.map((p) => (
                    <Badge key={p.id} variant="secondary" className="text-xs font-normal">
                      {p.label || p.role || p.id}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {removed && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    disabled={!canManage || putMutation.isPending}
                    data-testid="button-make-sellable-again"
                  >
                    Make sellable again
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Make {product.name} sellable again?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Puts this product back in the store index. Existing offer and personas are kept.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        putMutation.mutate(
                          { purchasable: true },
                          {
                            onSuccess: () =>
                              toast({ title: "Product is sellable again" }),
                          },
                        );
                      }}
                    >
                      Make sellable again
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {product.purchasable && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!canManage || putMutation.isPending}
                    data-testid="button-remove-product"
                  >
                    Remove as product
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {product.name} as a product?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <p>
                          Not sellable anymore — leaves the store index. Offer and personas stay on
                          disk so you can turn it back on later.
                        </p>
                        <p>
                          Prefer <strong>Pause</strong> if this is temporary. Funnel page bindings are
                          not cleared automatically
                          {bindings.length > 0
                            ? ` (${bindings.length} page${bindings.length === 1 ? "" : "s"} still reference this product).`
                            : "."}
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        putMutation.mutate(
                          { purchasable: false },
                          {
                            onSuccess: () =>
                              toast({
                                title: "Product removed",
                                description: "Not sellable. Audience kept. Use Make sellable again to restore.",
                              }),
                          },
                        );
                      }}
                      data-testid="button-confirm-remove-product"
                    >
                      Remove as product
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </>
      )}
    </div>
  );
}
