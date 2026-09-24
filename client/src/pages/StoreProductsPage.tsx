import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconShoppingBag, IconCheck, IconX, IconPlus } from "@tabler/icons-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PrivateHistoryBackButton } from "@/components/private/PrivateHistoryBackButton";
import { AddProductModal } from "@/components/store/AddProductModal";
import { isActivelySelling } from "@/lib/ecommerceProductMap";

interface EcommerceProduct {
  product_id: string;
  name: string;
  content_type: string;
  content_slug: string;
  actively_selling?: boolean;
  active?: boolean;
  description?: string;
}

interface EcommerceResponse {
  products: EcommerceProduct[];
  settings: {
    currency: string;
    locale: string;
    tax_inclusive: boolean;
  };
}

function ProductSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-5 w-16" />
      </div>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

export default function StoreProductsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const { data, isLoading, isError } = useQuery<EcommerceResponse>({
    queryKey: ["/api/ecommerce/products"],
  });

  const products = data?.products ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <PrivateHistoryBackButton data-testid="button-back" iconClassName="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <IconShoppingBag className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-xl font-semibold" data-testid="heading-products">
              Products
            </h1>
            {!isLoading && (
              <Badge variant="secondary" data-testid="badge-product-count">
                {products.length}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setAddOpen(true)}
            data-testid="button-add-product"
          >
            <IconPlus className="h-4 w-4 mr-1.5" />
            Add product
          </Button>
        </div>

        <AddProductModal open={addOpen} onOpenChange={setAddOpen} />

        {isError && (
          <Card data-testid="error-state">
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Failed to load products. Please try again.
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="space-y-3" data-testid="loading-skeleton">
            <ProductSkeleton />
            <ProductSkeleton />
            <ProductSkeleton />
          </div>
        )}

        {!isLoading && !isError && products.length === 0 && (
          <Card data-testid="empty-state">
            <CardContent className="py-12 text-center space-y-3">
              <IconShoppingBag className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No products yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Use Add product to pick a page and make it sellable. Audience can be filled on the
                product page afterward.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setAddOpen(true)}
                data-testid="button-add-product-empty"
              >
                <IconPlus className="h-4 w-4 mr-1.5" />
                Add product
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && products.length > 0 && (
          <div className="space-y-3" data-testid="product-list">
            {products.map((product) => (
              <Link key={product.product_id} href={`/private/store/product/${product.content_slug}`}>
                <Card
                  className="hover-elevate cursor-pointer"
                  data-testid={`card-product-${product.product_id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <CardTitle
                          className="text-base"
                          data-testid={`text-product-name-${product.product_id}`}
                        >
                          {product.name}
                        </CardTitle>
                        <p
                          className="text-xs text-muted-foreground mt-0.5 font-mono"
                          data-testid={`text-product-id-${product.product_id}`}
                        >
                          {product.product_id}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={
                          isActivelySelling(product)
                            ? "pointer-events-none border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 shadow-none"
                            : "pointer-events-none"
                        }
                        data-testid={`badge-product-active-${product.product_id}`}
                      >
                        {isActivelySelling(product) ? (
                          <>
                            <IconCheck className="h-3 w-3 mr-1" />
                            Selling
                          </>
                        ) : (
                          <>
                            <IconX className="h-3 w-3 mr-1" />
                            Paused
                          </>
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span data-testid={`text-product-type-${product.product_id}`}>
                        <span className="font-medium text-foreground">Type:</span>{" "}
                        {product.content_type}
                      </span>
                      <span data-testid={`text-product-slug-${product.product_id}`}>
                        <span className="font-medium text-foreground">Slug:</span>{" "}
                        {product.content_slug}
                      </span>
                    </div>
                    {product.description && (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={`text-product-desc-${product.product_id}`}
                      >
                        {product.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
