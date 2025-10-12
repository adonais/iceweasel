/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use sdl3::{video, event, gpu, pixels, keyboard};
use webrender_api::DebugFlags;
use webrender_api::debugger::{DebuggerMessage, ProfileCounterId};
use crate::{command, net};
use std::mem;
use std::collections::{HashMap, VecDeque};
use std::fs;

const FONT_SIZE: f32 = 16.0;

#[derive(Debug)]
pub struct GraphStats {
    pub min: f64,
    pub avg: f64,
    pub max: f64,
    pub sum: f64,
    pub samples: usize,
}

pub struct Graph {
    name: String,
    values: VecDeque<f64>,
}

impl Graph {
    fn new(name: &str, max_samples: usize) -> Self {
        let mut values = VecDeque::new();
        values.reserve(max_samples);

        Graph {
            name: name.into(),
            values
        }
    }

    fn push(&mut self, val: f64) {
        if self.values.len() == self.values.capacity() {
            self.values.pop_back();
        }
        self.values.push_front(val);
    }

    pub fn stats(&self) -> GraphStats {
        let mut stats = GraphStats {
            min: f64::MAX,
            avg: 0.0,
            max: -f64::MAX,
            sum: 0.0,
            samples: 0,
        };

        let mut samples = 0;
        for value in &self.values {
            if value.is_finite() {
                stats.min = stats.min.min(*value);
                stats.max = stats.max.max(*value);
                stats.sum += *value;
                samples += 1;
            }
        }

        if samples > 0 {
            stats.avg = stats.sum / samples as f64;
            stats.samples = samples;
        }

        stats
    }
}

enum DocumentKind {
    Text {
        content: String,
    },
}

struct Document {
    title: String,
    kind: DocumentKind,
}

enum ApplicationEventKind {
    RunCommand(String),
}

struct ApplicationEvent {
    kind: ApplicationEventKind,
}

struct Context<'a> {
    events: &'a sdl3::EventSubsystem,
    data_model: &'a mut DataModel,
    net: &'a mut net::HttpConnection,
    font_mono_id: imgui::FontId,
    cmd_history: &'a mut Vec<String>,
    cmd_history_index: &'a mut usize,
    cmd_list: &'a command::CommandList,
}

struct DataModel {
    is_connected: bool,
    debug_flags: DebugFlags,
    cmd: String,
    log: Vec<String>,
    documents: Vec<Document>,
    preview_doc_index: usize,
    profile_graphs: HashMap<ProfileCounterId, Graph>,
}

impl DataModel {
    fn new() -> Self {
        DataModel {
            is_connected: false,
            debug_flags: DebugFlags::empty(),
            cmd: String::new(),
            log: Vec::new(),
            documents: Vec::new(),
            preview_doc_index: 0,
            profile_graphs: HashMap::new(),
        }
    }
}

pub struct Gui {
    sdl: sdl3::Sdl,
    device: gpu::Device,
    window: video::Window,
    imgui: imgui_sdl3::ImGuiSdl3,
    data_model: DataModel,
    net: net::HttpConnection,
    host: String,
    cmd_list: command::CommandList,
    cmd_history: Vec<String>,
    cmd_history_index: usize,
    doc_id: usize,
}

impl Gui {
    pub fn new(host: &str, cmd_list: command::CommandList) -> Self {
        let sdl = sdl3::init().unwrap();
        let video_subsystem = sdl.video().unwrap();

        let window = video_subsystem
            .window("WebRender Debug UI", 1280, 720)
            .position_centered()
            .resizable()
            .high_pixel_density()
            .build()
            .unwrap();

        video_subsystem.text_input().start(&window);

        let device = gpu::Device::new(gpu::ShaderFormat::SPIRV, false)
            .unwrap()
            .with_window(&window)
            .unwrap();

        let imgui = imgui_sdl3::ImGuiSdl3::new(&device, &window, |ctx| {
            ctx.set_ini_filename(Some("wrshell.ini".into()));
            ctx.set_log_filename(None);

            let glyph_ranges = &[
                0x0020, 0x00FF, // Basic Latin + Latin Supplement
                0x2500, 0x257F, // Box drawing
                0,
            ];

            ctx.fonts().add_font(&[
                imgui::FontSource::TtfData {
                    data: include_bytes!("../res/FiraSans-Regular.ttf"),
                    size_pixels: FONT_SIZE,
                    config: Some(imgui::FontConfig {
                        glyph_ranges: imgui::FontGlyphRanges::from_slice(glyph_ranges),
                        ..Default::default()
                    }),
                },
            ]);
            ctx.fonts().add_font(&[
                imgui::FontSource::TtfData {
                    data: include_bytes!("../res/FiraCode-Regular.ttf"),
                    size_pixels: FONT_SIZE,
                    config: Some(imgui::FontConfig {
                        glyph_ranges: imgui::FontGlyphRanges::from_slice(glyph_ranges),
                        ..Default::default()
                    }),
                },
            ]);

            ctx.io_mut().config_flags |= imgui::ConfigFlags::DOCKING_ENABLE;

            match fs::read_to_string("default-layout.ini") {
                Ok(ini) => {
                    if !fs::exists("wrshell.ini").expect("bug") {
                        ctx.load_ini_settings(&ini);
                    }
                }
                Err(..) => {
                    println!("Unable to load default layout settings - perhaps wrong dir");
                }
            }
        });

        let net = net::HttpConnection::new(host);
        let data_model = DataModel::new();

        Gui {
            sdl,
            window,
            device,
            imgui,
            data_model,
            net,
            host: host.to_string(),
            cmd_list,
            cmd_history: Vec::new(),
            cmd_history_index: 0,
            doc_id: 0,
        }
    }

    pub fn run(mut self) {
        let mut event_pump = self.sdl.event_pump().unwrap();
        let mut pending_events = Vec::new();
        let event_subsystem = self.sdl.event().unwrap();

        event_subsystem.register_custom_event::<net::NetworkEvent>().unwrap();
        event_subsystem.register_custom_event::<ApplicationEvent>().unwrap();
        let event_sender = event_subsystem.event_sender();
        net::NetworkEventStream::spawn(
            &self.host,
            event_sender,
        );

        'main: loop {
            pending_events.push(event_pump.wait_event());
            for event in event_pump.poll_iter() {
                pending_events.push(event);
            }

            for event in pending_events.drain(..) {
                if let event::Event::Quit { .. } = event {
                    break 'main;
                }

                self.on_event(
                    event,
                    &event_subsystem,
                );
            }

            self.do_frame(
                &event_pump,
                &event_subsystem,
            );
        }
    }

    fn on_event(
        &mut self,
        event: event::Event,
        events: &sdl3::EventSubsystem,
    ) {
        if let Some(event) = event.as_user_event_type::<ApplicationEvent>() {
            match event.kind {
                ApplicationEventKind::RunCommand(cmd_name) => {
                    match self.cmd_list.get_mut(&cmd_name) {
                        Some(cmd) => {
                            let mut ctx = command::CommandContext {
                                net: &mut self.net,
                            };
                            let output = cmd.run(&mut ctx);

                            match output {
                                command::CommandOutput::Log(msg) => {
                                    self.data_model.log.push(msg);
                                }
                                command::CommandOutput::Err(msg) => {
                                    self.data_model.log.push(msg);
                                }
                                command::CommandOutput::TextDocument { title, content } => {
                                    let title = format!("{} [id {}]", title, self.doc_id);
                                    self.doc_id += 1;
                                    self.data_model.preview_doc_index = self.data_model.documents.len();
                                    self.data_model.documents.push(
                                        Document {
                                            title,
                                            kind: DocumentKind::Text {
                                                content,
                                            }
                                        }
                                    );
                                }
                            }
                        }
                        None => {
                            self.data_model.log.push(
                                format!("Unknown command '{}'", cmd_name)
                            );
                        }
                    }
                }
            }
        }

        if let Some(event) = event.as_user_event_type::<net::NetworkEvent>() {
            match event {
                net::NetworkEvent::Connected => {
                    self.data_model.is_connected = true;
                }
                net::NetworkEvent::Disconnected => {
                    self.data_model.is_connected = false;
                }
                net::NetworkEvent::Message(msg) => {
                    match msg {
                        DebuggerMessage::SetDebugFlags(info) => {
                            self.data_model.debug_flags = info.flags;
                        }
                        DebuggerMessage::InitProfileCounters(info) => {
                            // For now, just add a few counters to graph as proof of
                            // concept. We'll want to make this configurable in future
                            let selected_counters = [
                                "Frame building",
                                "Renderer",
                            ];

                            for counter in info.counters {
                                if selected_counters.contains(&counter.name.as_str()) {
                                    println!("Add profile counter {:?}", counter.name);
                                    self.data_model.profile_graphs.insert(
                                        counter.id,
                                        Graph::new(&counter.name, 512),
                                    );
                                }
                            }
                        }
                        DebuggerMessage::UpdateProfileCounters(info) => {
                            for counter in &info.updates {
                                if let Some(graph) = self.data_model
                                    .profile_graphs
                                    .get_mut(&counter.id) {
                                    graph.push(counter.value);
                                }
                            }
                        }
                    }
                }
            }

            return;
        }

        match event {
            event::Event::KeyUp { keycode, .. } => {
                if keycode == Some(keyboard::Keycode::Escape) {
                    events.push_event(event::Event::Quit { timestamp: 0 }).ok();
                }
            }
            _ => {}
        }

        self.imgui.handle_event(&event);
    }

    fn do_frame(
        &mut self,
        event_pump: &sdl3::EventPump,
        events: &sdl3::EventSubsystem,
    ) {
        let mut command_buffer = self.device.acquire_command_buffer().expect("bug");

        if let Ok(swapchain) = command_buffer.wait_and_acquire_swapchain_texture(&self.window) {
            let color_targets = [gpu::ColorTargetInfo::default()
                .with_texture(&swapchain)
                .with_load_op(gpu::LoadOp::CLEAR)
                .with_store_op(gpu::StoreOp::STORE)
                .with_clear_color(pixels::Color::RGB(128, 128, 128))];

            self.imgui.render(
                &mut self.sdl,
                &self.device,
                &self.window,
                event_pump,
                &mut command_buffer,
                &color_targets,
                |ui| {
                    let fonts = ui.fonts().fonts();

                    let mut ctx = Context {
                        events,
                        data_model: &mut self.data_model,
                        net: &mut self.net,
                        font_mono_id: fonts[1],
                        cmd_history: &mut self.cmd_history,
                        cmd_history_index: &mut self.cmd_history_index,
                        cmd_list: &self.cmd_list,
                    };

                    do_main_ui(
                        ui,
                        &mut ctx,
                    );

                    // ui.show_demo_window(&mut true);
                },
            );

            command_buffer.submit().expect("bug");
        } else {
            command_buffer.cancel();
        }
    }
}

fn do_debug_flags_ui(
    ui: &mut imgui::Ui,
    ctx: &mut Context,
) {
    ui.window("Debug Flags").build(|| {
        let mut push_flags = false;

        push_flags |= ui.checkbox_flags(
            "Profiler",
            &mut ctx.data_model.debug_flags,
            DebugFlags::PROFILER_DBG
        );
        push_flags |= ui.checkbox_flags(
            "Render Targets",
            &mut ctx.data_model.debug_flags,
            DebugFlags::RENDER_TARGET_DBG
        );
        push_flags |= ui.checkbox_flags(
            "Texture Cache",
            &mut ctx.data_model.debug_flags,
            DebugFlags::TEXTURE_CACHE_DBG
        );

        if push_flags {
            ctx.net.post_with_content("debug-flags", &ctx.data_model.debug_flags).ok();
        }
    });
}

fn do_documents_ui(
    ui: &mut imgui::Ui,
    ctx: &mut Context,
) {
    ui.window("Documents")
        .build(|| {
            for (i, doc) in ctx.data_model.documents.iter_mut().enumerate() {
                if ui.selectable(&doc.title) {
                    ctx.data_model.preview_doc_index = i;
                }
            }
        });
}

fn do_shell_ui(
    ui: &mut imgui::Ui,
    ctx: &mut Context,
) {
    ui.window("Shell")
        .build(|| {
            let font_token = ui.push_font(ctx.font_mono_id);

            let footer_height_to_reserve =
                unsafe { ui.style().item_spacing[1] } +
                ui.frame_height_with_spacing();

            ui.child_window("log")
                .size([0.0, -footer_height_to_reserve])
                .horizontal_scrollbar(true)
                .build(|| {
                for line in &ctx.data_model.log {
                    ui.text(line);
                }
                if ui.scroll_y() > ui.scroll_max_y() {
                    ui.set_scroll_here_y();
                }
            });
            ui.separator();
            ui.set_next_item_width(-1.0);
            // if !ui.is_any_item_focused() {
            //     ui.set_keyboard_focus_here();
            // }
            let completion = CommandCompletion {
                cmd_history: ctx.cmd_history,
                cmd_history_index: ctx.cmd_history_index,
                cmd_list: ctx.cmd_list,
            };
            if ui.input_text("##cmd_input", &mut ctx.data_model.cmd)
                .hint("Enter command (or help)")
                .enter_returns_true(true)
                .callback(
                    imgui::InputTextCallback::COMPLETION | imgui::InputTextCallback::HISTORY,
                    completion,
                )
                .build() {
                let cmd = mem::replace(&mut ctx.data_model.cmd, String::new());
                let push_history = match ctx.cmd_history.last() {
                    Some(prev) => *prev != cmd,
                    None => true,
                };
                if push_history {
                    ctx.cmd_history.push(cmd.clone());
                }
                *ctx.cmd_history_index = ctx.cmd_history.len();
                ctx.events.push_custom_event(ApplicationEvent {
                    kind: ApplicationEventKind::RunCommand(cmd),
                }).ok();
                ui.set_keyboard_focus_here_with_offset(imgui::FocusedWidget::Previous);
            }
            font_token.pop();
        });
}

fn do_profiler_ui(
    ui: &mut imgui::Ui,
    ctx: &mut Context,
) {
    ui.window("Profiler")
        .build(|| {
            for graph in ctx.data_model.profile_graphs.values() {
                let stats = graph.stats();

                ui.text(&graph.name);

                let gw = 1024.0;
                let gh = 128.0;
                ui.invisible_button(&graph.name, [gw, gh]);

                let draw_list = ui.get_window_draw_list();
                let max_samples = graph.values.capacity() as f32;

                let p0 = ui.item_rect_min();
                let p1 = ui.item_rect_max();

                draw_list
                    .add_rect(p0, p1, [0.3, 0.3, 0.3, 1.0])
                    .filled(true)
                    .build();

                let bx1 = p1[0];
                let by1 = p1[1];

                let w = gw / max_samples;
                let h = gh;

                let color_t0 = [0.0, 1.0, 0.0, 1.0];
                let color_b0 = [0.0, 0.8, 0.0, 1.0];

                let color_t2 = [1.0, 0.0, 0.0, 1.0];
                let color_b2 = [0.8, 0.0, 0.0, 1.0];

                for (index, sample) in graph.values.iter().enumerate() {
                    if !sample.is_finite() {
                        // NAN means no sample this frame.
                        continue;
                    }
                    let sample = *sample as f32;
                    let x1 = bx1 - index as f32 * w;
                    let x0 = x1 - w;

                    let y0 = by1 - (sample / stats.max as f32) as f32 * h;
                    let y1 = by1;

                    let (color_top, color_bottom) = if false {
                        (color_t2, color_b2)
                    } else {
                        (color_t0, color_b0)
                    };

                    // let (color_top, color_bottom) = if counter.is_unexpected_value(sample as f64) {
                    //     (color_t2, color_b2)
                    // } else {
                    //     (color_t0, color_b0)
                    // };

                    draw_list.add_rect_filled_multicolor(
                        [x0, y0],
                        [x1, y1],
                        color_top,
                        color_top,
                        color_bottom,
                        color_bottom,
                    );
                }
            }
        });
}

fn do_preview_ui(
    ui: &mut imgui::Ui,
    ctx: &mut Context,
) {
    ui.window("Preview")
        .build(|| {
            if ctx.data_model.preview_doc_index < ctx.data_model.documents.len() {
                let doc = &ctx.data_model.documents[ctx.data_model.preview_doc_index];

                match doc.kind {
                    DocumentKind::Text { ref content } => {
                        let font_token = ui.push_font(ctx.font_mono_id);
                        ui.text(content);
                        font_token.pop();
                    }
                }
            }
        });
}

fn do_main_ui(
    ui: &mut imgui::Ui,
    ctx: &mut Context,
) {
    ui.dockspace_over_main_viewport();

    ui.main_menu_bar(|| {
        ui.menu("File", || {
            if ui.menu_item("Exit") {
                ctx.events.push_event(event::Event::Quit { timestamp: 0 }).ok();
            }
        });
        ui.menu("Help", || {
            ui.menu_item("About");
        });

        let (msg, text_color, bg_color) = if ctx.data_model.is_connected {
            ("Connected", [0.3, 0.3, 0.3, 1.0], [0.0, 1.0, 0.0, 1.0])
        } else {
            ("Disconnected", [1.0, 1.0, 1.0, 1.0], [1.0, 0.0, 0.0, 1.0])
        };

        let size = ui.calc_text_size(msg);
        let io = ui.io();
        let padding = unsafe { ui.style().frame_padding };

        ui.set_cursor_pos([
            io.display_size[0] - size[0] - padding[0],
            0.0,
        ]);
        let rect_p0 = [
            io.display_size[0] - size[0] - 2.0 * padding[0],
            0.0,
        ];
        let rect_p1 = [
            io.display_size[0],
            rect_p0[1] + size[1] + padding[1],
        ];
        ui.get_window_draw_list()
            .add_rect(rect_p0, rect_p1, bg_color)
            .filled(true)
            .build();
        ui.text_colored(text_color, msg);
    });

    do_shell_ui(ui, ctx);
    do_debug_flags_ui(ui, ctx);
    do_documents_ui(ui, ctx);
    do_preview_ui(ui, ctx);
    do_profiler_ui(ui, ctx);
}

struct CommandCompletion<'a> {
    cmd_history: &'a mut Vec<String>,
    cmd_history_index: &'a mut usize,
    cmd_list: &'a command::CommandList,
}

impl<'a> imgui::InputTextCallbackHandler for CommandCompletion<'a> {
    fn on_completion(&mut self, mut data: imgui::TextCallbackData) {
        let mut cmd_names = Vec::new();
        for cmd in self.cmd_list.cmds() {
            cmd_names.push(cmd.descriptor().name);
        }
        let auto_complete = strprox::Autocompleter::new(&cmd_names);

        let result = auto_complete.autocomplete(data.str(), 3);

        if result.is_empty() {
            return;
        }

        let result_strings: Vec<&str> = result
            .iter()
            .map(|measured_prefix| measured_prefix.string.as_str())
            .collect();

        let completion = if result_strings.len() == 1 {
            result_strings[0]
        } else if result_strings[0] == data.str() {
            result_strings[1]
        } else {
            result_strings[0]
        };

        data.clear();
        data.push_str(completion);
    }

    fn on_history(&mut self, dir: imgui::HistoryDirection, mut data: imgui::TextCallbackData) {
        if self.cmd_history.is_empty() {
            return;
        }

        match dir {
            imgui::HistoryDirection::Up => {
                if *self.cmd_history_index == 0 {
                    return;
                }

                *self.cmd_history_index -= 1;
            }
            imgui::HistoryDirection::Down => {
                if *self.cmd_history_index == self.cmd_history.len() - 1 {
                    return;
                }

                *self.cmd_history_index += 1;
            }
        }

        data.clear();
        data.push_str(&self.cmd_history[*self.cmd_history_index]);
    }
}
