import { ComponentId, Component } from "j-component";

export {
  behavior,
  Component,
  ComponentJSON,
  ComponentId,
  RootComponent,
  create as render,
} from "j-component";

export interface LoadOptions {
  compiler?: "official" | "simulate";
  rootPath?: string;
  less?: boolean;
  usingComponents?: Object;
}

export interface MockComponentDefinition {
  id?: string;
  tagName?: string;
  template: string;
  usingComponents?: Object;
  behaviors: Array<any>;
  options: Object
}

export function load<
  TData extends WechatMiniprogram.Component.DataOption,
  TProperty extends WechatMiniprogram.Component.PropertyOption,
  TMethod extends WechatMiniprogram.Component.MethodOption
  >(
  options: WechatMiniprogram.Component.Options<TData, TProperty, TMethod> &
    LoadOptions & {
    id?: string;
    tagName?: string;
    template?: string;
  }
): ComponentId<TData, TProperty, TMethod>;
export function load(
  componentPath: string,
  tagName: string,
  options?: LoadOptions
): string;

export function loadMpx(
  componentPath: string,
  tagName?: string,
  options?: LoadOptions
): string;

export function mockComponent(
  compName: string,
  compDefinition: MockComponentDefinition
): void;

export function clearMockComponent(): void;

export function match(dom: Node, html: string): boolean;

export function sleep(timeout: number): Promise<void>;

export function scroll(
  component: Component<any, any, any>,
  destOffset: number,
  times?: number,
  propName?: string
): void;
