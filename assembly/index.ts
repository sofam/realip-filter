export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, RootContextHelper, ContextHelper, registerRootContext, FilterHeadersStatusValues, stream_context, HeaderPair } from "@solo-io/proxy-runtime";
import { send_local_response, GrpcStatusValues } from "@solo-io/proxy-runtime/assembly/runtime";
import { ArrayBuffer } from "assemblyscript/std/assembly/arraybuffer";


class AddHeaderRoot extends RootContext {
  configuration: string;
  ip_list: string[];

  onConfigure(): bool {
    let conf_buffer = super.getConfiguration();
    let result = String.UTF8.decode(conf_buffer);
    this.configuration = result;
    this.ip_list = this.configuration.split(",");
    return true;
  }

  createContext(): Context {
    return ContextHelper.wrap(new AddHeader(this));
  }
}

class AddHeader extends Context {
  client_ip: string = "";
  root_context: AddHeaderRoot;
  constructor(root_context: AddHeaderRoot) {
    super();
    this.root_context = root_context;
  }

  onRequestHeaders(a: u32): FilterHeadersStatusValues {
    const root_context = this.root_context;

    let cf_connecting_ip = stream_context.headers.request.get("CF-Connecting-IP") || "";
    if (cf_connecting_ip != "") {
      this.client_ip = cf_connecting_ip;
    }
    else {
      let x_forwarded_for = stream_context.headers.request.get("X-Forwarded-For") || "";
      let ips = x_forwarded_for.split(",");
      if (ips.length > 1) {
        // Get the third from the end
        this.client_ip = ips[ips.length - 3]
      }
    }
    if (this.client_ip != "") {
      for (let index = 0; index < root_context.ip_list.length; index++) {
        if (root_context.ip_list[index] == this.client_ip) {
          return FilterHeadersStatusValues.Continue;
        }
        else {
          let buffer = new ArrayBuffer(8);
          send_local_response(401, "Unauthorized", buffer, [], GrpcStatusValues.PermissionDenied);
          return FilterHeadersStatusValues.Continue;
        }
      }
    }
    return FilterHeadersStatusValues.Continue;
  }


  onResponseHeaders(a: u32): FilterHeadersStatusValues {
    const root_context = this.root_context;

    if (root_context.configuration == "") {
      stream_context.headers.response.add("hello", "world!");
      if (this.client_ip != "") {
        stream_context.headers.response.add("Client-IP", this.client_ip);
      }
    } else {
      stream_context.headers.response.add("hello", root_context.configuration);
    }
    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext(() => { return RootContextHelper.wrap(new AddHeaderRoot()); }, "add_header");