/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'epubjs' {
  export interface NavItem {
    id: string;
    href: string;
    label: string;
    subitems?: NavItem[];
  }

  export interface Navigation {
    toc: NavItem[];
  }

  export interface Location {
    start: {
      cfi: string;
      displayed: {
        page: number;
        total: number;
      };
      percentage?: number;
    };
    end: {
      cfi: string;
    };
    atStart?: boolean;
    atEnd?: boolean;
  }

  export interface RenditionThemes {
    fontSize: (size: string | number) => void;
    register: (name: string, styles: Record<string, any> | string) => void;
    select: (name: string) => void;
  }

  export interface RenditionAnnotations {
    highlight: (
      cfiRange: string,
      data?: Record<string, any>,
      cb?: (e: any) => void,
      className?: string,
      styles?: Record<string, any>
    ) => void;
    underline: (
      cfiRange: string,
      data?: Record<string, any>,
      cb?: (e: any) => void,
      className?: string,
      styles?: Record<string, any>
    ) => void;
    mark: (
      cfiRange: string,
      data?: Record<string, any>,
      cb?: (e: any) => void
    ) => void;
    remove: (cfiRange: string, type?: string) => void;
  }

  export interface Rendition {
    display: (target?: string) => Promise<void>;
    prev: () => Promise<void>;
    next: () => Promise<void>;
    destroy: () => void;
    on: (event: string, callback: (...args: any[]) => void) => void;
    off: (event: string, callback: (...args: any[]) => void) => void;
    themes: RenditionThemes;
    currentLocation: () => Location;
    annotations: RenditionAnnotations;
  }

  export interface Locations {
    generate: (chars?: number) => Promise<string[]>;
    percentageFromCfi: (cfi: string) => number;
    cfiFromPercentage: (percentage: number) => string;
  }

  export interface Book {
    renderTo: (element: HTMLElement | string, options?: Record<string, any>) => Rendition;
    ready: Promise<void>;
    loaded: {
      navigation: Promise<Navigation>;
      metadata: Promise<Record<string, any>>;
    };
    locations: Locations;
    destroy: () => void;
  }

  export default function ePub(
    urlOrData?: string | ArrayBuffer,
    options?: Record<string, any>
  ): Book;
}
