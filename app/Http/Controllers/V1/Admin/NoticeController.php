<?php

namespace App\Http\Controllers\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\NoticeSave;
use App\Models\Notice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class NoticeController extends Controller
{
    public function fetch(Request $request)
    {
        $notices = Notice::query()->orderByDesc('id');
        if ($request->filled('id')) {
            return response(['data' => $notices->findOrFail($request->validate([
                'id' => 'required|integer|min:1',
            ])['id'])]);
        }
        if (!$request->has('current') && !$request->has('pageSize')) {
            return response(['data' => $notices->get()]);
        }
        $page = $request->validate([
            'current' => 'required|integer|min:1',
            'pageSize' => 'required|integer|min:1|max:100',
        ]);
        $total = $notices->count();
        return response([
            'data' => $notices->forPage($page['current'], $page['pageSize'])
                ->get(['id', 'title', 'title_en', 'show', 'tags', 'created_at', 'updated_at']),
            'total' => $total,
        ]);
    }

    public function save(NoticeSave $request)
    {
        $data = $request->only([
            'title',
            'title_en',
            'content',
            'content_en',
            'img_url',
            'tags'
        ]);
        if (!$request->input('id')) {
            if (!Notice::create($data)) {
                abort(500, '保存失败');
            }
        } else {
            try {
                Notice::find($request->input('id'))->update($data);
            } catch (\Exception $e) {
                abort(500, '保存失败');
            }
        }
        return response([
            'data' => true
        ]);
    }



    public function show(Request $request)
    {
        if (empty($request->input('id'))) {
            abort(500, '参数有误');
        }
        $notice = Notice::find($request->input('id'));
        if (!$notice) {
            abort(500, '公告不存在');
        }
        $notice->show = $notice->show ? 0 : 1;
        if (!$notice->save()) {
            abort(500, '保存失败');
        }

        return response([
            'data' => true
        ]);
    }

    public function drop(Request $request)
    {
        if (empty($request->input('id'))) {
            abort(500, '参数错误');
        }
        $notice = Notice::find($request->input('id'));
        if (!$notice) {
            abort(500, '公告不存在');
        }
        if (!$notice->delete()) {
            abort(500, '删除失败');
        }
        return response([
            'data' => true
        ]);
    }
}
