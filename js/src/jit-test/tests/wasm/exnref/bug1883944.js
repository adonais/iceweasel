new WebAssembly.Module(wasmTextToBinary(`
(module
    (func (param f64)
      try_table (catch_all 0)
        loop 
          try_table (catch_all 0) 
            memory.size
            drop
          end
        end
      end
    )
    (memory i64 1 1)
  )
`));
