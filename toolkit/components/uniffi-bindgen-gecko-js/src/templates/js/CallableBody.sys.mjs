{%- for arg in callable.arguments %}
{%- if !fixture %}
{{ arg.ty.ffi_converter() }}.checkType({{ arg.name }});
{%- else %}
if ({{ arg.name }} instanceof UniffiSkipJsTypeCheck) {
    {{ arg.name }} = {{ arg.name }}.value;
} else {
    {{ arg.ty.ffi_converter() }}.checkType({{ arg.name }});
}
{%- endif %}
{%- endfor %}
const result = {% if callable.is_js_async %}await {% endif %}{{ callable.uniffi_scaffolding_method }}(
    {{ callable.id }}, // {{ callable.ffi_func.0 }}
    {%- if let CallableKind::Method { self_type, .. } = callable.kind %}
    {{ self_type.ffi_converter() }}.lowerReceiver(this),
    {%- endif %}
    {%- for arg in callable.arguments %}
    {{ arg.ty.ffi_converter() }}.lower({{ arg.name }}),
    {%- endfor %}
)
return handleRustResult(
    result,

    {%- match callable.return_type %}
    {%- when Some(return_type) %}
    {{ return_type.ty.ffi_converter() }}.lift.bind({{ return_type.ty.ffi_converter() }}),
    {%- when None %}
    (result) => undefined,
    {%- endmatch %}

    {%- match callable.throws_type %}
    {%- when Some(err_type) %}
    {{ err_type.ty.ffi_converter() }}.lift.bind({{ err_type.ty.ffi_converter() }}),
    {%- when None %}
    null,
    {%- endmatch %}
)
